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
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface WeeklyWindow {
    days: Weekday[];
    start: string;
    end: string;
}
export interface HolidayCalendar {
    year: number;
    timeZone: string;
    dates: string[];
    source: string;
    verifiedAt?: string;
    description?: string;
}
export interface PricingPolicy {
    id: string;
    providers: string[];
    models: string[];
    timeZone: string;
    blocked: WeeklyWindow[];
    flatModels?: string[];
    holidays?: HolidayCalendar[];
    multiplier?: number;
    source: string;
    verifiedAt?: string;
}
export type PricingState = 'OFF_PEAK' | 'PEAK' | 'FLAT' | 'UNTRACKED' | 'UNKNOWN';
export interface PolicyDecision {
    state: PricingState;
    allowed: boolean;
    policy?: PricingPolicy;
    nextTransition?: number;
    reason?: string;
}
export interface FlatProviderFact {
    name: string;
    note: string;
    source: string;
    verifiedAt: string;
}
/**
 * Chinese statutory public holidays for 2026.
 *
 * Source: 国务院办公厅关于2026年部分节假日安排的通知 (国办发明电〔2025〕7号),
 * published 2025-11-04. Weekend make-up workdays stay OFF_PEAK because the
 * pricing rule already treats weekends as off-peak.
 */
export declare const CHINA_PUBLIC_HOLIDAYS_2026: HolidayCalendar;
export declare const CHINA_PUBLIC_HOLIDAYS: HolidayCalendar[];
/** The paid providers this plugin owns. Everything else is out of scope. */
export declare const MANAGED_PROVIDERS: readonly ["opencode-go", "deepseek"];
export declare function isManagedProvider(providerId: string): boolean;
/** Peak windows published for OpenCode Go DeepSeek models, in UTC. */
export declare const OPENCODE_GO_DEEPSEEK_PEAK_WINDOWS: WeeklyWindow[];
/**
 * Peak windows published by the official DeepSeek Direct API, in UTC.
 *
 * Kept as a separate fact from the OpenCode Go windows even though the current
 * values match: the two providers publish and may change their schedules
 * independently.
 */
export declare const DEEPSEEK_DIRECT_PEAK_WINDOWS: WeeklyWindow[];
/**
 * The Go pricing table prices only the DeepSeek models by time of day.
 * Every other documented Go model has one all-hours price and is listed
 * explicitly so an unlisted future model still fails closed.
 */
export declare const DEEPSEEK_OPENCODE_GO: PricingPolicy;
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
export declare const DEEPSEEK_API: PricingPolicy;
/**
 * Both paid providers are managed, but through distinct policies. A model
 * outside its provider's verified list still fails closed (UNKNOWN).
 */
export declare const BUILTIN_POLICIES: PricingPolicy[];
/** Providers verified to have no peak/off-peak tiers at all. */
export declare const VERIFIED_FLAT_PROVIDERS: Record<string, FlatProviderFact>;
export declare function flatProviderNote(providerId: string): string | undefined;
export declare function validateTimeZone(timeZone: string): void;
export declare function resolvePolicy(policies: PricingPolicy[], providerId: string, modelId: string): PricingPolicy | undefined;
export declare function evaluatePricing(policies: PricingPolicy[], providerId: string, modelId: string, nowMs?: number): PolicyDecision;
export declare function formatInTimeZone(epochMs: number, timeZone: string): string;
export declare function formatTransitionInTimeZone(epochMs: number, timeZone: string, nowMs?: number): string;
