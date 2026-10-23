import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OffpeakEngine } from '../dist/engine.js'
import { OffpeakStateStore } from '../dist/state.js'

const PEAK = Date.parse('2026-10-19T02:00:00Z')

function fakeClock(start) {
  let now = start
  const timers = []
  return {
    now: () => now,
    setTimer(callback, delay) {
      const timer = { at: now + delay, callback, cleared: false }
      timers.push(timer)
      return timer
    },
    clearTimer(timer) { timer.cleared = true },
    async advanceTo(target) {
      for (;;) {
        const pending = timers.filter(timer => !timer.cleared && timer.at <= target).sort((a, b) => a.at - b.at)[0]
        if (!pending) break
        now = Math.max(now, pending.at)
        pending.cleared = true
        pending.callback()
        await new Promise(resolve => setImmediate(resolve))
      }
      now = target
    },
    pending: () => timers.filter(timer => !timer.cleared).length,
  }
}

async function engineAt(start = PEAK) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-offpeak-'))
  const clock = fakeClock(start)
  const store = new OffpeakStateStore(join(dir, 'state.json'))
  await store.load()
  const engine = new OffpeakEngine({
    store,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  })
  return { engine, clock, dir, store }
}

test('a peak request parks with one boundary timer and no provider call', async () => {
  const { engine, clock, dir } = await engineAt()
  let resolved = false
  const wait = engine.waitUntilAllowed({ provider: 'opencode-go', model: 'deepseek-v4.1-flash', sessionId: 's1' })
    .then(value => { resolved = true; return value })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(resolved, false)
  assert.equal(engine.activeHolds().length, 1)
  assert.equal(clock.pending(), 1)
  await clock.advanceTo(Date.parse('2026-10-19T04:00:00Z'))
  const decision = await wait
  assert.equal(decision.allowed, true)
  assert.equal(decision.state, 'OFF_PEAK')
  assert.equal(engine.activeHolds().length, 0)
  await rm(dir, { recursive: true, force: true })
})

test('a wrong-session override does not leak into another session', async () => {
  const { engine, clock, dir } = await engineAt()
  await engine.setSessionProtection('s1', 'off')
  assert.equal(engine.evaluate('opencode-go', 'deepseek-v4.1-flash', 's1').allowed, true)
  assert.equal(engine.evaluate('opencode-go', 'deepseek-v4.1-flash', 's2').allowed, false)
  await clock.advanceTo(Date.parse('2026-10-19T04:00:00Z'))
  await rm(dir, { recursive: true, force: true })
})

test('session off releases an existing hold exactly once', async () => {
  const { engine, clock, dir } = await engineAt()
  const wait = engine.waitUntilAllowed({ provider: 'opencode-go', model: 'deepseek-v4.1-flash', sessionId: 's1' })
  await new Promise(resolve => setImmediate(resolve))
  await engine.setSessionProtection('s1', 'off')
  const decision = await wait
  assert.equal(decision.allowed, true)
  assert.equal(decision.sessionProtection, 'off')
  assert.equal(engine.activeHolds().length, 0)
  assert.equal(clock.pending(), 0)
  await clock.advanceTo(Date.parse('2026-10-19T04:00:00Z'))
  await rm(dir, { recursive: true, force: true })
})

test('session on restores protection for the next request', async () => {
  const { engine, clock, dir } = await engineAt()
  await engine.setSessionProtection('s1', 'off')
  await engine.setSessionProtection('s1', 'on')
  const decision = engine.evaluate('opencode-go', 'deepseek-v4.1-flash', 's1')
  assert.equal(decision.allowed, false)
  assert.equal(decision.sessionProtection, 'on')
  await clock.advanceTo(Date.parse('2026-10-19T04:00:00Z'))
  await rm(dir, { recursive: true, force: true })
})

test('off pauses dispatch and never authorizes peak pricing', async () => {
  const { engine, clock, dir } = await engineAt()
  await engine.setEnabled(false)
  const decision = engine.evaluate('opencode-go', 'deepseek-v4.1-flash', 's1')
  assert.equal(decision.allowed, false)
  assert.match(decision.reason, /paused/)
  await engine.setEnabled(true)
  assert.equal(engine.evaluate('opencode-go', 'deepseek-v4.1-flash', 's1').allowed, false)
  await clock.advanceTo(Date.parse('2026-10-19T04:00:00Z'))
  await rm(dir, { recursive: true, force: true })
})

test('UNKNOWN stays fail-closed even with a session override', async () => {
  const { engine, clock, dir } = await engineAt()
  await engine.setSessionProtection('s1', 'off')
  const decision = engine.evaluate('opencode-go', 'not-a-model', 's1')
  assert.equal(decision.state, 'UNKNOWN')
  assert.equal(decision.allowed, false)
  await clock.advanceTo(Date.parse('2026-10-19T04:00:00Z'))
  await rm(dir, { recursive: true, force: true })
})

test('flat and untracked routes are never parked', async () => {
  const { engine, clock, dir } = await engineAt()
  assert.equal(engine.evaluate('opencode-go', 'gpt-6-luna').allowed, true)
  assert.equal(engine.evaluate('opencode', 'deepseek-v4.1-flash-free').allowed, true)
  await clock.advanceTo(Date.parse('2026-10-19T04:00:00Z'))
  await rm(dir, { recursive: true, force: true })
})

test('abort releases the hold and the timer', async () => {
  const { engine, clock, dir } = await engineAt()
  const controller = new AbortController()
  const wait = engine.waitUntilAllowed({ provider: 'opencode-go', model: 'deepseek-v4.1-flash', sessionId: 's1', signal: controller.signal })
  await new Promise(resolve => setImmediate(resolve))
  controller.abort()
  await assert.rejects(wait, /aborted/)
  assert.equal(engine.activeHolds().length, 0)
  assert.equal(clock.pending(), 0)
  await clock.advanceTo(Date.parse('2026-10-19T04:00:00Z'))
  await rm(dir, { recursive: true, force: true })
})

test('session override persists across a reload', async () => {
  const { engine, clock, dir, store } = await engineAt()
  await engine.setSessionProtection('s1', 'off')
  await store.flush()
  const reopened = new OffpeakStateStore(store.path)
  await reopened.load()
  assert.equal(reopened.current().sessions.s1.protection, 'off')
  await clock.advanceTo(Date.parse('2026-10-19T04:00:00Z'))
  await rm(dir, { recursive: true, force: true })
})
