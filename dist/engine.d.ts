/** Pricing guard: pure policy evaluation plus one cancellable wait per held request. */
import { type PolicyDecision, type PricingPolicy } from './policy.js';
import type { OffpeakState, OffpeakStateStore } from './state.js';
export type HoldKind = 'primary' | 'auxiliary' | 'compaction' | 'title';
export interface OffpeakDecision extends PolicyDecision {
    /** Whether the global control toggle is on. */
    enabled: boolean;
    /** Whether this exact session has an explicit protection override. */
    sessionProtection: 'on' | 'off';
}
export interface HoldRecord {
    id: number;
    sessionId: string;
    provider: string;
    model: string;
    kind: HoldKind;
    since: number;
    nextTransition?: number;
}
export interface WaitRequest {
    provider: string;
    model: string;
    sessionId?: string;
    kind?: HoldKind;
    signal?: AbortSignal;
}
export interface OffpeakEngineOptions {
    store: OffpeakStateStore;
    policies?: PricingPolicy[];
    now?: () => number;
    displayTimeZone?: string;
    setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
    clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}
/** One process-local pricing guard. It owns timers, holds, and the wake signal. */
export declare class OffpeakEngine {
    private readonly store;
    private readonly policies;
    private readonly now;
    readonly displayTimeZone: string;
    private readonly setTimer;
    private readonly clearTimer;
    private readonly waiters;
    private readonly holds;
    private nextHoldId;
    private disposed;
    constructor(options: OffpeakEngineOptions);
    load(): Promise<void>;
    statusState(): OffpeakState;
    evaluate(provider: string, model: string, sessionId?: string, now?: number): OffpeakDecision;
    waitUntilAllowed(request: WaitRequest): Promise<OffpeakDecision>;
    wakeWaiters(): void;
    setEnabled(enabled: boolean): Promise<OffpeakState>;
    setSessionProtection(sessionId: string, protection: 'on' | 'off'): Promise<OffpeakState>;
    activeHolds(): HoldRecord[];
    formatDeadline(epochMs: number): string;
    dispose(): void;
}
