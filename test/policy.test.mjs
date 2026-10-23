import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BUILTIN_POLICIES,
  DEEPSEEK_API,
  DEEPSEEK_OPENCODE_GO,
  evaluatePricing,
  formatTransitionInTimeZone,
} from '../dist/policy.js'

const at = iso => Date.parse(iso)

test('weekday peak window blocks the OpenCode Go DeepSeek route', () => {
  const decision = evaluatePricing(BUILTIN_POLICIES, 'opencode-go', 'deepseek-v4.1-flash', at('2026-10-19T02:00:00Z'))
  assert.equal(decision.state, 'PEAK')
  assert.equal(decision.allowed, false)
  assert.equal(decision.policy?.id, 'deepseek-opencode-go')
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

test('the Direct API policy covers both current models at the verified peak window', () => {
  for (const model of ['deepseek-flash', 'deepseek-v4-pro']) {
    const decision = evaluatePricing(BUILTIN_POLICIES, 'deepseek', model, at('2026-10-19T02:00:00Z'))
    assert.equal(decision.state, 'PEAK', model)
    assert.equal(decision.allowed, false, model)
    assert.equal(decision.policy?.id, 'deepseek-api', model)
    assert.equal(decision.policy?.source, 'https://api-docs.deepseek.com/quick_start/pricing', model)
    assert.equal(decision.policy?.verifiedAt, '2026-10-23', model)
    assert.equal(decision.nextTransition, at('2026-10-19T04:00:00Z'), model)
  }
})

test('legacy Direct Flash aliases are covered and billed at the Flash policy', () => {
  for (const model of ['deepseek-v4-flash', 'deepseek-v4-flash-vision-exp']) {
    const decision = evaluatePricing(BUILTIN_POLICIES, 'deepseek', model, at('2026-10-19T06:30:00Z'))
    assert.equal(decision.state, 'PEAK', model)
    assert.equal(decision.policy?.id, 'deepseek-api', model)
  }
})

test('Direct API off-peak, weekends, and Chinese holidays are allowed', () => {
  for (const time of [
    '2026-10-19T05:00:00Z',
    '2026-10-24T02:00:00Z',
    '2026-10-01T02:00:00Z',
  ]) {
    const decision = evaluatePricing(BUILTIN_POLICIES, 'deepseek', 'deepseek-flash', at(time))
    assert.equal(decision.state, 'OFF_PEAK', time)
    assert.equal(decision.allowed, true, time)
  }
})

test('an unlisted Direct model fails closed', () => {
  const decision = evaluatePricing(BUILTIN_POLICIES, 'deepseek', 'deepseek-v9-unknown', at('2026-10-19T05:00:00Z'))
  assert.equal(decision.state, 'UNKNOWN')
  assert.equal(decision.allowed, false)
  assert.match(decision.reason, /not in the verified off-peak pricing policy/)
})

test('OpenCode Go and Direct policies are separate facts', () => {
  assert.deepEqual(BUILTIN_POLICIES.map(policy => policy.id), ['deepseek-opencode-go', 'deepseek-api'])
  assert.deepEqual(BUILTIN_POLICIES.map(policy => policy.providers), [['opencode-go'], ['deepseek']])
  assert.notEqual(DEEPSEEK_API, DEEPSEEK_OPENCODE_GO)
  assert.notEqual(DEEPSEEK_API.blocked, DEEPSEEK_OPENCODE_GO.blocked)
  assert.notEqual(DEEPSEEK_API.source, DEEPSEEK_OPENCODE_GO.source)
  assert.equal(DEEPSEEK_OPENCODE_GO.source, 'https://opencode.ai/docs/go/')
  assert.equal(DEEPSEEK_OPENCODE_GO.verifiedAt, '2026-10-23')
  assert.ok(DEEPSEEK_API.models.includes('deepseek-flash'))
  assert.ok(DEEPSEEK_API.models.includes('deepseek-v4-pro'))
  assert.ok(!DEEPSEEK_OPENCODE_GO.models.includes('deepseek-flash'))
})

test('provider-specific windows are used even when the built-ins currently match', () => {
  const policies = [
    {
      id: 'test-opencode-go', providers: ['opencode-go'], models: ['deepseek-test'],
      timeZone: 'UTC', blocked: [{ days: [1], start: '01:00', end: '02:00' }],
      source: 'test', verifiedAt: '2026-10-23',
    },
    {
      id: 'test-deepseek', providers: ['deepseek'], models: ['deepseek-test'],
      timeZone: 'UTC', blocked: [{ days: [1], start: '06:00', end: '07:00' }],
      source: 'test', verifiedAt: '2026-10-23',
    },
  ]
  const first = at('2026-10-19T01:30:00Z')
  assert.equal(evaluatePricing(policies, 'opencode-go', 'deepseek-test', first).state, 'PEAK')
  assert.equal(evaluatePricing(policies, 'deepseek', 'deepseek-test', first).state, 'OFF_PEAK')
  const second = at('2026-10-19T06:30:00Z')
  assert.equal(evaluatePricing(policies, 'opencode-go', 'deepseek-test', second).state, 'OFF_PEAK')
  assert.equal(evaluatePricing(policies, 'deepseek', 'deepseek-test', second).state, 'PEAK')
  assert.equal(evaluatePricing(policies, 'deepseek', 'deepseek-test', second).policy?.id, 'test-deepseek')
})

test('transition formatting names the boundary and date', () => {
  const label = formatTransitionInTimeZone(at('2026-10-20T01:00:00Z'), 'UTC', at('2026-10-19T02:00:00Z'))
  assert.equal(label, 'Oct 20, 01:00 UTC')
})
