import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BUILTIN_POLICIES,
  evaluatePricing,
  formatTransitionInTimeZone,
} from '../dist/policy.js'

const at = iso => Date.parse(iso)

test('weekday peak window blocks the Go DeepSeek route', () => {
  const decision = evaluatePricing(BUILTIN_POLICIES, 'opencode-go', 'deepseek-v4.1-flash', at('2026-10-19T02:00:00Z'))
  assert.equal(decision.state, 'PEAK')
  assert.equal(decision.allowed, false)
  assert.equal(decision.nextTransition, at('2026-10-19T04:00:00Z'))
})

test('the gap between peak windows is off-peak', () => {
  const decision = evaluatePricing(BUILTIN_POLICIES, 'opencode-go', 'deepseek-v4.1-flash', at('2026-10-19T05:00:00Z'))
  assert.equal(decision.state, 'OFF_PEAK')
  assert.equal(decision.allowed, true)
  assert.equal(decision.nextTransition, at('2026-10-19T06:00:00Z'))
})

test('weekends are off-peak even inside the weekday window', () => {
  const decision = evaluatePricing(BUILTIN_POLICIES, 'opencode-go', 'deepseek-v4.1-flash', at('2026-10-24T02:00:00Z'))
  assert.equal(decision.state, 'OFF_PEAK')
  assert.equal(decision.allowed, true)
})

test('Chinese statutory holidays are full-day off-peak', () => {
  const decision = evaluatePricing(BUILTIN_POLICIES, 'opencode-go', 'deepseek-v4.1-flash', at('2026-10-01T02:00:00Z'))
  assert.equal(decision.state, 'OFF_PEAK')
  assert.equal(decision.allowed, true)
})

test('next transition skips a holiday peak window', () => {
  const decision = evaluatePricing(BUILTIN_POLICIES, 'opencode-go', 'deepseek-v4.1-flash', at('2026-09-30T23:00:00Z'))
  assert.equal(decision.state, 'OFF_PEAK')
  assert.equal(decision.nextTransition, at('2026-10-08T01:00:00Z'))
})

test('flat Go models are never delayed', () => {
  for (const model of ['gpt-6-luna', 'beam-free', 'longcat-2.5-preview-free']) {
    const decision = evaluatePricing(BUILTIN_POLICIES, 'opencode-go', model, at('2026-10-19T02:00:00Z'))
    assert.equal(decision.state, 'FLAT', model)
    assert.equal(decision.allowed, true)
    assert.equal(decision.nextTransition, undefined)
  }
})

test('an unlisted Go model fails closed at every hour', () => {
  for (const time of ['2026-10-19T02:00:00Z', '2026-10-19T05:00:00Z', '2026-10-24T02:00:00Z']) {
    const decision = evaluatePricing(BUILTIN_POLICIES, 'opencode-go', 'deepseek-v9-unknown', at(time))
    assert.equal(decision.state, 'UNKNOWN')
    assert.equal(decision.allowed, false)
    assert.match(decision.reason, /not in the verified off-peak pricing policy/)
  }
})

test('untracked OpenCode Zen is allowed and documented as flat', () => {
  const decision = evaluatePricing(BUILTIN_POLICIES, 'opencode', 'deepseek-v4.1-flash-free', at('2026-10-19T02:00:00Z'))
  assert.equal(decision.state, 'UNTRACKED')
  assert.equal(decision.allowed, true)
})

test('direct DeepSeek is outside the managed provider boundary', () => {
  assert.deepEqual(BUILTIN_POLICIES.map(policy => policy.id), ['deepseek-opencode-go'])
  assert.deepEqual(BUILTIN_POLICIES.flatMap(policy => policy.providers), ['opencode-go'])
  for (const time of ['2026-10-19T02:00:00Z', '2026-10-19T05:00:00Z', '2026-10-24T02:00:00Z']) {
    const decision = evaluatePricing(BUILTIN_POLICIES, 'deepseek', 'deepseek-flash', at(time))
    assert.equal(decision.state, 'UNTRACKED', time)
    assert.equal(decision.allowed, true)
    assert.equal(decision.nextTransition, undefined)
  }
})

test('transition formatting names the boundary and date', () => {
  const label = formatTransitionInTimeZone(at('2026-10-20T01:00:00Z'), 'UTC', at('2026-10-19T02:00:00Z'))
  assert.equal(label, 'Oct 20, 01:00 UTC')
})
