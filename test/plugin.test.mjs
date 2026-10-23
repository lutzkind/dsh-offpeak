import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../dist/index.js'

const PEAK = Date.parse('2026-10-19T02:00:00Z')
const OFF_PEAK = Date.parse('2026-10-19T04:00:00Z')

function makeContext() {
  const listeners = new Map()
  const services = new Map()
  const commands = new Map()
  const ctx = {
    on(name, listener, options) {
      const list = listeners.get(name) ?? []
      if (options?.prepend) list.unshift(listener)
      else list.push(listener)
      listeners.set(name, list)
      return () => true
    },
    effect(setup) {
      const dispose = setup()
      if (typeof dispose === 'function') ctx.disposers.push(dispose)
    },
    provide(name, value) {
      services.set(name, value)
      return () => services.delete(name)
    },
    get(name) { return services.get(name) },
    logger: { info() {}, warn() {}, error() {} },
    commands: {
      register(definition) {
        commands.set(definition.name, definition)
        return () => commands.delete(definition.name)
      },
    },
    disposers: [],
  }
  ctx.emit = (name, payload, initial) => {
    const list = listeners.get(name) ?? []
    let index = -1
    const next = () => {
      index += 1
      if (index >= list.length) return typeof initial === 'function' ? initial() : initial
      return list[index](payload, next)
    }
    return next()
  }
  ctx.command = name => commands.get(name)
  return ctx
}

function installFakeTime(start) {
  const originalNow = Date.now
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  let now = start
  const timers = []
  Date.now = () => now
  globalThis.setTimeout = (callback, delay) => {
    const timer = { at: now + Number(delay), callback, cleared: false }
    timers.push(timer)
    return timer
  }
  globalThis.clearTimeout = timer => { if (timer) timer.cleared = true }
  return {
    advanceTo(target) {
      for (;;) {
        const pending = timers.filter(timer => !timer.cleared && timer.at <= target).sort((a, b) => a.at - b.at)[0]
        if (!pending) break
        now = Math.max(now, pending.at)
        pending.cleared = true
        pending.callback()
      }
      now = target
    },
    pending: () => timers.filter(timer => !timer.cleared).length,
    restore() {
      Date.now = originalNow
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
    },
  }
}

function invocation(sessionId, route) {
  return {
    agent: { session: { id: sessionId, requestHeader: () => ({ config: route }) } },
    rawInput: '',
    signal: new AbortController().signal,
  }
}

test('a peak agent step waits before dispatch and releases once at the boundary', async () => {
  const time = installFakeTime(PEAK)
  const dir = await mkdtemp(join(tmpdir(), 'dsh-offpeak-plugin-'))
  const ctx = makeContext()
  await apply(ctx, { displayTimeZone: 'UTC', statePath: join(dir, 'state.json') })
  let resolved = false
  const request = ctx.emit('agent/request', {
    agent: { session: { id: 's1' } }, signal: new AbortController().signal, turn: 1, step: 1,
  }, { provider: 'opencode-go', model: 'deepseek-v4.1-flash' }).then(value => { resolved = true; return value })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(resolved, false)
  assert.equal(time.pending(), 1)
  const status = await ctx.command('offpeak').handler(invocation('s1', { provider: 'opencode-go', model: 'deepseek-v4.1-flash' }))
  assert.match(status.text, /Pricing: PEAK/)
  assert.match(status.text, /Held requests: 1 waiting for off-peak/)
  time.advanceTo(OFF_PEAK)
  const config = await request
  assert.equal(config.provider, 'opencode-go')
  assert.equal(resolved, true)
  const after = await ctx.command('offpeak').handler(invocation('s1', { provider: 'opencode-go', model: 'deepseek-v4.1-flash' }))
  assert.match(after.text, /Pricing: OFF_PEAK/)
  assert.match(after.text, /Held requests: none/)
  time.restore()
  ctx.disposers.forEach(dispose => dispose())
  await rm(dir, { recursive: true, force: true })
})

test('a session override releases only that session', async () => {
  const time = installFakeTime(PEAK)
  const dir = await mkdtemp(join(tmpdir(), 'dsh-offpeak-plugin-'))
  const ctx = makeContext()
  await apply(ctx, { displayTimeZone: 'UTC', statePath: join(dir, 'state.json') })
  const command = ctx.command('offpeak')
  await command.handler({ ...invocation('s1', { provider: 'opencode-go', model: 'deepseek-v4.1-flash' }), rawInput: 'session off' })
  const allowed = await ctx.emit('agent/request', {
    agent: { session: { id: 's1' } }, signal: new AbortController().signal, turn: 1, step: 1,
  }, { provider: 'opencode-go', model: 'deepseek-v4.1-flash' })
  assert.equal(allowed.model, 'deepseek-v4.1-flash')
  let otherResolved = false
  const other = ctx.emit('agent/request', {
    agent: { session: { id: 's2' } }, signal: new AbortController().signal, turn: 1, step: 1,
  }, { provider: 'opencode-go', model: 'deepseek-v4.1-flash' }).then(() => { otherResolved = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(otherResolved, false)
  time.advanceTo(OFF_PEAK)
  await other
  time.restore()
  ctx.disposers.forEach(dispose => dispose())
  await rm(dir, { recursive: true, force: true })
})

test('unknown models fail closed and never reach a provider handoff', async () => {
  const time = installFakeTime(PEAK)
  const dir = await mkdtemp(join(tmpdir(), 'dsh-offpeak-plugin-'))
  const ctx = makeContext()
  await apply(ctx, { displayTimeZone: 'UTC', statePath: join(dir, 'state.json') })
  const command = ctx.command('offpeak')
  const status = await command.handler(invocation('s1', { provider: 'opencode-go', model: 'deepseek-v9-unknown' }))
  assert.match(status.text, /UNKNOWN \(fail-closed\)/)
  assert.match(status.text, /Request decision: WAITING/)
  time.restore()
  ctx.disposers.forEach(dispose => dispose())
  await rm(dir, { recursive: true, force: true })
})

test('an auxiliary direct LLM call is held by the llm/stream guard', async () => {
  const time = installFakeTime(PEAK)
  const dir = await mkdtemp(join(tmpdir(), 'dsh-offpeak-plugin-'))
  const ctx = makeContext()
  await apply(ctx, { displayTimeZone: 'UTC', statePath: join(dir, 'state.json') })
  let dispatched = false
  const stream = ctx.emit('llm/stream', {
    provider: 'opencode-go', model: 'deepseek-v4.1-flash', sessionId: 's1', purpose: 'compaction',
    signal: new AbortController().signal,
  }, async function* () {
    dispatched = true
    yield { type: 'text-delta', text: 'ok' }
  })
  const iterator = stream[Symbol.asyncIterator]()
  const first = iterator.next()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(dispatched, false)
  time.advanceTo(OFF_PEAK)
  const value = await first
  assert.equal(value.done, false)
  assert.equal(dispatched, true)
  await iterator.return?.()
  time.restore()
  ctx.disposers.forEach(dispose => dispose())
  await rm(dir, { recursive: true, force: true })
})
