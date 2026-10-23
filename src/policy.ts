/**
 * Verified paid-provider pricing policies and pure evaluation.
 *
 * Ownership boundary: the shipped plugin manages the two paid providers
 * `opencode-go` and `deepseek`. Each provider keeps its own policy, source, and
 * model coverage even when the current peak windows happen to match. The
 * OpenCode Zen reference provider (`opencode`) is out of scope.
 *
 * `dsh-free-first` remains OpenCode Go-only and never participates in these
 * policies.
 */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface WeeklyWindow {
  days: Weekday[]
  start: string
  end: string
}

export interface HolidayCalendar {
  year: number
  timeZone: string
  dates: string[]
  source: string
  verifiedAt?: string
  description?: string
}

export interface PricingPolicy {
  id: string
  providers: string[]
  models: string[]
  timeZone: string
  blocked: WeeklyWindow[]
  flatModels?: string[]
  holidays?: HolidayCalendar[]
  multiplier?: number
  source: string
  verifiedAt?: string
}

export type PricingState = 'OFF_PEAK' | 'PEAK' | 'FLAT' | 'UNTRACKED' | 'UNKNOWN'

export interface PolicyDecision {
  state: PricingState
  allowed: boolean
  policy?: PricingPolicy
  nextTransition?: number
  reason?: string
}

export interface FlatProviderFact {
  name: string
  note: string
  source: string
  verifiedAt: string
}

/**
 * Chinese statutory public holidays for 2026.
 *
 * Source: 国务院办公厅关于2026年部分节假日安排的通知 (国办发明电〔2025〕7号),
 * published 2025-11-04. Weekend make-up workdays stay OFF_PEAK because the
 * pricing rule already treats weekends as off-peak.
 */
export const CHINA_PUBLIC_HOLIDAYS_2026: HolidayCalendar = {
  year: 2026,
  timeZone: 'Asia/Shanghai',
  dates: [
    '2026-01-01', '2026-01-02', '2026-01-03',
    '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
    '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
    '2026-04-04', '2026-04-05', '2026-04-06',
    '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
    '2026-06-19', '2026-06-20', '2026-06-21',
    '2026-09-25', '2026-09-26', '2026-09-27',
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    '2026-10-05', '2026-10-06', '2026-10-07',
  ],
  source: 'https://www.gov.cn/gongbao/2025/issue_12406/202511/content_7048922.html',
  verifiedAt: '2026-10-14',
  description: 'Chinese statutory public holidays; State Council notice 国办发明电〔2025〕7号 (2025-11-04)',
}

export const CHINA_PUBLIC_HOLIDAYS: HolidayCalendar[] = [CHINA_PUBLIC_HOLIDAYS_2026]

/** The paid providers this plugin owns. Everything else is out of scope. */
export const MANAGED_PROVIDERS = ['opencode-go', 'deepseek'] as const

export function isManagedProvider(providerId: string): boolean {
  return (MANAGED_PROVIDERS as readonly string[]).includes(providerId.toLowerCase())
}

/** Peak windows published for OpenCode Go DeepSeek models, in UTC. */
export const OPENCODE_GO_DEEPSEEK_PEAK_WINDOWS: WeeklyWindow[] = [
  { days: [1, 2, 3, 4, 5], start: '01:00', end: '04:00' },
  { days: [1, 2, 3, 4, 5], start: '06:00', end: '10:00' },
]

/**
 * Peak windows published by the official DeepSeek Direct API, in UTC.
 *
 * Kept as a separate fact from the OpenCode Go windows even though the current
 * values match: the two providers publish and may change their schedules
 * independently.
 */
export const DEEPSEEK_DIRECT_PEAK_WINDOWS: WeeklyWindow[] = [
  { days: [1, 2, 3, 4, 5], start: '01:00', end: '04:00' },
  { days: [1, 2, 3, 4, 5], start: '06:00', end: '10:00' },
]

/**
 * The Go pricing table prices only the DeepSeek models by time of day.
 * Every other documented Go model has one all-hours price and is listed
 * explicitly so an unlisted future model still fails closed.
 */
export const DEEPSEEK_OPENCODE_GO: PricingPolicy = {
  id: 'deepseek-opencode-go',
  providers: ['opencode-go'],
  models: [
    'deepseek-v4.1-flash',
    'deepseek-v4-pro',
    'deepseek-v4-flash',
    'deepseek-v4-flash-vision-exp',
  ],
  flatModels: [
    'grok-*', 'gpt-*', 'claude-*', 'gemini-*', 'glm-*', 'kimi-*', 'longcat-*',
    'mimo-*', 'minimax-*', 'muse-*', 'qwen*', 'hy*', 'space-bunny', 'step-*',
    'cat-jam-free', 'beam-*',
  ],
  timeZone: 'UTC',
  blocked: OPENCODE_GO_DEEPSEEK_PEAK_WINDOWS,
  holidays: CHINA_PUBLIC_HOLIDAYS,
  multiplier: 2,
  source: 'https://opencode.ai/docs/go/',
  verifiedAt: '2026-10-23',
}

/**
 * Official DeepSeek Direct API pricing policy.
 *
 * Freshly verified 2026-10-23 against
 * https://api-docs.deepseek.com/quick_start/pricing:
 *
 * - peak hours are 01:00-04:00 and 06:00-10:00 UTC, Monday-Friday;
 * - Chinese public holidays and weekends are off-peak in full;
 * - off-peak rates are 50% of peak rates;
 * - current models are `deepseek-flash` and `deepseek-v4-pro`; the legacy
 *   aliases `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` are still
 *   accepted and billed at the Flash price.
 *
 * This policy is deliberately separate from the OpenCode Go policy. The two
 * providers may change their schedules independently even when the current
 * windows match.
 */
export const DEEPSEEK_API: PricingPolicy = {
  id: 'deepseek-api',
  providers: ['deepseek'],
  models: [
    'deepseek-flash',
    'deepseek-v4-pro',
    'deepseek-v4-flash',
    'deepseek-v4-flash-vision-exp',
  ],
  timeZone: 'UTC',
  blocked: DEEPSEEK_DIRECT_PEAK_WINDOWS,
  holidays: CHINA_PUBLIC_HOLIDAYS,
  multiplier: 2,
  source: 'https://api-docs.deepseek.com/quick_start/pricing',
  verifiedAt: '2026-10-23',
}

/**
 * Both paid providers are managed, but through distinct policies. A model
 * outside its provider's verified list still fails closed (UNKNOWN).
 */
export const BUILTIN_POLICIES: PricingPolicy[] = [DEEPSEEK_OPENCODE_GO, DEEPSEEK_API]

/** Providers verified to have no peak/off-peak tiers at all. */
export const VERIFIED_FLAT_PROVIDERS: Record<string, FlatProviderFact> = {
  opencode: {
    name: 'OpenCode Zen',
    note: 'Zen publishes one all-hours price per model with no peak/off-peak tiers, so there is no off-peak window to wait for and requests are never delayed.',
    source: 'https://opencode.ai/docs/zen/',
    verifiedAt: '2026-10-15',
  },
}

export function flatProviderNote(providerId: string): string | undefined {
  return VERIFIED_FLAT_PROVIDERS[providerId.toLowerCase()]?.note
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MINUTE_MS = 60_000
const MAX_LOOKAHEAD_DAYS = 14
const MAX_LOOKAHEAD_MINUTES = MAX_LOOKAHEAD_DAYS * 24 * 60

export function validateTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0)
  } catch {
    throw new Error(`Invalid IANA time zone: ${timeZone}`)
  }
}

function minuteOfDay(value: string): number {
  const match = /^(\d{2}):(\d{2})$/u.exec(value)
  if (!match) throw new Error(`Invalid time ${value}; expected HH:mm.`)
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) throw new Error(`Invalid time ${value}; expected HH:mm.`)
  return hour * 60 + minute
}

function formatter(timeZone: string): Intl.DateTimeFormat {
  validateTimeZone(timeZone)
  return new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}

function localParts(epochMs: number, format: Intl.DateTimeFormat): { weekday: Weekday; minute: number } {
  const parts = Object.fromEntries(format.formatToParts(epochMs).map(({ type, value }) => [type, value]))
  const weekdayIndex = DAY_NAMES.findIndex(day => day.startsWith(parts.weekday ?? ''))
  if (weekdayIndex < 0) throw new Error('Could not determine local weekday.')
  return {
    weekday: weekdayIndex as Weekday,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

const holidayFormatters = new Map<string, Intl.DateTimeFormat>()

function holidayFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = holidayFormatters.get(timeZone)
  if (cached) return cached
  validateTimeZone(timeZone)
  const format = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  holidayFormatters.set(timeZone, format)
  return format
}

function calendarDate(epochMs: number, format: Intl.DateTimeFormat): string {
  const parts = Object.fromEntries(format.formatToParts(epochMs).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function isFullDayOffPeak(policy: PricingPolicy, epochMs: number): boolean {
  for (const calendar of policy.holidays ?? []) {
    if (calendar.dates.includes(calendarDate(epochMs, holidayFormatter(calendar.timeZone)))) return true
  }
  return false
}

function isBlockedAt(policy: PricingPolicy, epochMs: number, format: Intl.DateTimeFormat): boolean {
  if (isFullDayOffPeak(policy, epochMs)) return false
  const local = localParts(epochMs, format)
  return policy.blocked.some((window) => {
    const start = minuteOfDay(window.start)
    const end = minuteOfDay(window.end)
    if (start < end) {
      return window.days.includes(local.weekday) && local.minute >= start && local.minute < end
    }
    const previousDay = ((local.weekday + 6) % 7) as Weekday
    return (window.days.includes(local.weekday) && local.minute >= start)
      || (window.days.includes(previousDay) && local.minute < end)
  })
}

function nextTransition(policy: PricingPolicy, nowMs: number, currentBlocked: boolean): number {
  const format = formatter(policy.timeZone)
  const first = Math.floor(nowMs / MINUTE_MS) * MINUTE_MS + MINUTE_MS
  for (let minute = 0; minute <= MAX_LOOKAHEAD_MINUTES; minute += 1) {
    const candidate = first + minute * MINUTE_MS
    if (isBlockedAt(policy, candidate, format) !== currentBlocked) return candidate
  }
  throw new Error(`No pricing transition found in the next ${MAX_LOOKAHEAD_DAYS} days for ${policy.id}.`)
}

function matches(pattern: string, modelId: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replaceAll('*', '.*')
  return new RegExp(`^${escaped}$`, 'iu').test(modelId)
}

export function resolvePolicy(
  policies: PricingPolicy[],
  providerId: string,
  modelId: string,
): PricingPolicy | undefined {
  const providerPolicies = policies.filter(policy =>
    policy.providers.some(provider => provider.toLowerCase() === providerId.toLowerCase()))
  if (!providerPolicies.length) return undefined

  const modelPolicies = providerPolicies.filter(policy =>
    policy.models.some(model => matches(model, modelId)))
  if (modelPolicies.length > 1) {
    throw new Error(`More than one pricing policy matches ${providerId}/${modelId}.`)
  }
  if (modelPolicies.length) return modelPolicies[0]

  const flatPolicies = providerPolicies.filter(policy =>
    (policy.flatModels ?? []).some(model => matches(model, modelId)))
  if (flatPolicies.length > 1) {
    throw new Error(`More than one flat pricing policy matches ${providerId}/${modelId}.`)
  }
  if (flatPolicies.length) return flatPolicies[0]

  throw new Error(
    `Provider ${providerId} is configured, but model ${modelId} is not in the verified off-peak pricing policy for this release. Update dsh-offpeak or add a verified custom policy before using this model.`,
  )
}

export function evaluatePricing(
  policies: PricingPolicy[],
  providerId: string,
  modelId: string,
  nowMs = Date.now(),
): PolicyDecision {
  let policy: PricingPolicy | undefined
  try {
    policy = resolvePolicy(policies, providerId, modelId)
    if (!policy) {
      return { state: 'UNTRACKED', allowed: true, reason: 'No policy matches this provider.' }
    }
    if (!policy.models.some(model => matches(model, modelId))) {
      return {
        state: 'FLAT',
        allowed: true,
        policy,
        reason: `${providerId}/${modelId} has flat all-hours pricing and no peak window.`,
      }
    }
    const format = formatter(policy.timeZone)
    const peak = isBlockedAt(policy, nowMs, format)
    return {
      state: peak ? 'PEAK' : 'OFF_PEAK',
      allowed: !peak,
      policy,
      nextTransition: nextTransition(policy, nowMs, peak),
    }
  } catch (error) {
    return {
      state: 'UNKNOWN',
      allowed: false,
      ...(policy ? { policy } : {}),
      reason: error instanceof Error ? error.message : 'Unknown pricing policy error.',
    }
  }
}

export function formatInTimeZone(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(epochMs)
}

export function formatTransitionInTimeZone(
  epochMs: number,
  timeZone: string,
  nowMs = Date.now(),
): string {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(epochMs)
  const day = (value: number) => new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
  const label = `${time} ${timeZone}`
  if (day(epochMs) === day(nowMs)) return label
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
  }).format(epochMs)
  return `${date}, ${label}`
}
