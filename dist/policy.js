/**
 * Verified OpenCode Go peak pricing policy and pure evaluation.
 *
 * Ownership boundary: the shipped plugin manages the `opencode-go` provider
 * only. The direct DeepSeek API (`deepseek`) has its own native Harness
 * routing and must never be delayed, authorized, or rejected by this package.
 */
/**
 * Chinese statutory public holidays for 2026.
 *
 * Source: 国务院办公厅关于2026年部分节假日安排的通知 (国办发明电〔2025〕7号),
 * published 2025-11-04. Weekend make-up workdays stay OFF_PEAK because the
 * pricing rule already treats weekends as off-peak.
 */
export const CHINA_PUBLIC_HOLIDAYS_2026 = {
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
};
export const CHINA_PUBLIC_HOLIDAYS = [CHINA_PUBLIC_HOLIDAYS_2026];
/** The one provider this plugin owns. Everything else is out of scope. */
export const MANAGED_PROVIDER = 'opencode-go';
export function isManagedProvider(providerId) {
    return providerId.toLowerCase() === MANAGED_PROVIDER;
}
/** Peak windows published by the OpenCode Go gateway, in UTC. */
export const DEEPSEEK_PEAK_WINDOWS = [
    { days: [1, 2, 3, 4, 5], start: '01:00', end: '04:00' },
    { days: [1, 2, 3, 4, 5], start: '06:00', end: '10:00' },
];
/**
 * The Go pricing table prices only the DeepSeek models by time of day.
 * Every other documented Go model has one all-hours price and is listed
 * explicitly so an unlisted future model still fails closed.
 */
export const DEEPSEEK_OPENCODE_GO = {
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
    blocked: DEEPSEEK_PEAK_WINDOWS,
    holidays: CHINA_PUBLIC_HOLIDAYS,
    multiplier: 2,
    source: 'https://opencode.ai/docs/go/',
    verifiedAt: '2026-10-15',
};
/**
 * The direct DeepSeek API is intentionally NOT managed.
 *
 * It is an independent, manually selected provider. Keeping it out of
 * `BUILTIN_POLICIES` makes the boundary structural: the plugin cannot hold,
 * deny, authorize, or otherwise intercept a `deepseek` route.
 */
export const BUILTIN_POLICIES = [DEEPSEEK_OPENCODE_GO];
/** Providers verified to have no peak/off-peak tiers at all. */
export const VERIFIED_FLAT_PROVIDERS = {
    opencode: {
        name: 'OpenCode Zen',
        note: 'Zen publishes one all-hours price per model with no peak/off-peak tiers, so there is no off-peak window to wait for and requests are never delayed.',
        source: 'https://opencode.ai/docs/zen/',
        verifiedAt: '2026-10-15',
    },
};
export function flatProviderNote(providerId) {
    return VERIFIED_FLAT_PROVIDERS[providerId.toLowerCase()]?.note;
}
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MINUTE_MS = 60_000;
const MAX_LOOKAHEAD_DAYS = 14;
const MAX_LOOKAHEAD_MINUTES = MAX_LOOKAHEAD_DAYS * 24 * 60;
export function validateTimeZone(timeZone) {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    }
    catch {
        throw new Error(`Invalid IANA time zone: ${timeZone}`);
    }
}
function minuteOfDay(value) {
    const match = /^(\d{2}):(\d{2})$/u.exec(value);
    if (!match)
        throw new Error(`Invalid time ${value}; expected HH:mm.`);
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59)
        throw new Error(`Invalid time ${value}; expected HH:mm.`);
    return hour * 60 + minute;
}
function formatter(timeZone) {
    validateTimeZone(timeZone);
    return new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
        timeZone,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    });
}
function localParts(epochMs, format) {
    const parts = Object.fromEntries(format.formatToParts(epochMs).map(({ type, value }) => [type, value]));
    const weekdayIndex = DAY_NAMES.findIndex(day => day.startsWith(parts.weekday ?? ''));
    if (weekdayIndex < 0)
        throw new Error('Could not determine local weekday.');
    return {
        weekday: weekdayIndex,
        minute: Number(parts.hour) * 60 + Number(parts.minute),
    };
}
const holidayFormatters = new Map();
function holidayFormatter(timeZone) {
    const cached = holidayFormatters.get(timeZone);
    if (cached)
        return cached;
    validateTimeZone(timeZone);
    const format = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    holidayFormatters.set(timeZone, format);
    return format;
}
function calendarDate(epochMs, format) {
    const parts = Object.fromEntries(format.formatToParts(epochMs).map(({ type, value }) => [type, value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}
function isFullDayOffPeak(policy, epochMs) {
    for (const calendar of policy.holidays ?? []) {
        if (calendar.dates.includes(calendarDate(epochMs, holidayFormatter(calendar.timeZone))))
            return true;
    }
    return false;
}
function isBlockedAt(policy, epochMs, format) {
    if (isFullDayOffPeak(policy, epochMs))
        return false;
    const local = localParts(epochMs, format);
    return policy.blocked.some((window) => {
        const start = minuteOfDay(window.start);
        const end = minuteOfDay(window.end);
        if (start < end) {
            return window.days.includes(local.weekday) && local.minute >= start && local.minute < end;
        }
        const previousDay = ((local.weekday + 6) % 7);
        return (window.days.includes(local.weekday) && local.minute >= start)
            || (window.days.includes(previousDay) && local.minute < end);
    });
}
function nextTransition(policy, nowMs, currentBlocked) {
    const format = formatter(policy.timeZone);
    const first = Math.floor(nowMs / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
    for (let minute = 0; minute <= MAX_LOOKAHEAD_MINUTES; minute += 1) {
        const candidate = first + minute * MINUTE_MS;
        if (isBlockedAt(policy, candidate, format) !== currentBlocked)
            return candidate;
    }
    throw new Error(`No pricing transition found in the next ${MAX_LOOKAHEAD_DAYS} days for ${policy.id}.`);
}
function matches(pattern, modelId) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replaceAll('*', '.*');
    return new RegExp(`^${escaped}$`, 'iu').test(modelId);
}
export function resolvePolicy(policies, providerId, modelId) {
    const providerPolicies = policies.filter(policy => policy.providers.some(provider => provider.toLowerCase() === providerId.toLowerCase()));
    if (!providerPolicies.length)
        return undefined;
    const modelPolicies = providerPolicies.filter(policy => policy.models.some(model => matches(model, modelId)));
    if (modelPolicies.length > 1) {
        throw new Error(`More than one pricing policy matches ${providerId}/${modelId}.`);
    }
    if (modelPolicies.length)
        return modelPolicies[0];
    const flatPolicies = providerPolicies.filter(policy => (policy.flatModels ?? []).some(model => matches(model, modelId)));
    if (flatPolicies.length > 1) {
        throw new Error(`More than one flat pricing policy matches ${providerId}/${modelId}.`);
    }
    if (flatPolicies.length)
        return flatPolicies[0];
    throw new Error(`Provider ${providerId} is configured, but model ${modelId} is not in the verified off-peak pricing policy for this release. Update dsh-offpeak or add a verified custom policy before using this model.`);
}
export function evaluatePricing(policies, providerId, modelId, nowMs = Date.now()) {
    let policy;
    try {
        policy = resolvePolicy(policies, providerId, modelId);
        if (!policy) {
            return { state: 'UNTRACKED', allowed: true, reason: 'No policy matches this provider.' };
        }
        if (!policy.models.some(model => matches(model, modelId))) {
            return {
                state: 'FLAT',
                allowed: true,
                policy,
                reason: `${providerId}/${modelId} has flat all-hours pricing and no peak window.`,
            };
        }
        const format = formatter(policy.timeZone);
        const peak = isBlockedAt(policy, nowMs, format);
        return {
            state: peak ? 'PEAK' : 'OFF_PEAK',
            allowed: !peak,
            policy,
            nextTransition: nextTransition(policy, nowMs, peak),
        };
    }
    catch (error) {
        return {
            state: 'UNKNOWN',
            allowed: false,
            ...(policy ? { policy } : {}),
            reason: error instanceof Error ? error.message : 'Unknown pricing policy error.',
        };
    }
}
export function formatInTimeZone(epochMs, timeZone) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
    }).format(epochMs);
}
export function formatTransitionInTimeZone(epochMs, timeZone, nowMs = Date.now()) {
    const time = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(epochMs);
    const day = (value) => new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(value);
    const label = `${time} ${timeZone}`;
    if (day(epochMs) === day(nowMs))
        return label;
    const date = new Intl.DateTimeFormat('en-US', {
        timeZone,
        month: 'short',
        day: 'numeric',
    }).format(epochMs);
    return `${date}, ${label}`;
}
