/**
 * Verified OpenCode Go peak pricing policy and pure evaluation.
 *
 * Ownership boundary: the shipped plugin manages the `opencode-go` provider
 * only. The direct DeepSeek API (`deepseek`) has its own native Harness
 * routing and must never be delayed, authorized, or rejected by this package.
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
/** The one provider this plugin owns. Everything else is out of scope. */
export declare const MANAGED_PROVIDER = "opencode-go";
export declare function isManagedProvider(providerId: string): boolean;
/** Peak windows published by the OpenCode Go gateway, in UTC. */
export declare const DEEPSEEK_PEAK_WINDOWS: WeeklyWindow[];
/**
 * The Go pricing table prices only the DeepSeek models by time of day.
 * Every other documented Go model has one all-hours price and is listed
 * explicitly so an unlisted future model still fails closed.
 */
export declare const DEEPSEEK_OPENCODE_GO: PricingPolicy;
/**
 * The direct DeepSeek API is intentionally NOT managed.
 *
 * It is an independent, manually selected provider. Keeping it out of
 * `BUILTIN_POLICIES` makes the boundary structural: the plugin cannot hold,
 * deny, authorize, or otherwise intercept a `deepseek` route.
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
