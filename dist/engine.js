/** Pricing guard: pure policy evaluation plus one cancellable wait per held request. */
import { BUILTIN_POLICIES, evaluatePricing, formatTransitionInTimeZone, } from './policy.js';
function abortError(signal) {
    const reason = signal?.reason;
    if (reason instanceof Error)
        return reason;
    const error = new Error('off-peak wait aborted');
    error.name = 'AbortError';
    return error;
}
/** One process-local pricing guard. It owns timers, holds, and the wake signal. */
export class OffpeakEngine {
    store;
    policies;
    now;
    displayTimeZone;
    setTimer;
    clearTimer;
    waiters = new Set();
    holds = new Map();
    nextHoldId = 1;
    disposed = false;
    constructor(options) {
        this.store = options.store;
        this.policies = options.policies ?? BUILTIN_POLICIES;
        this.now = options.now ?? Date.now;
        this.displayTimeZone = options.displayTimeZone ?? 'UTC';
        this.setTimer = options.setTimer ?? setTimeout;
        this.clearTimer = options.clearTimer ?? clearTimeout;
    }
    async load() {
        await this.store.load();
    }
    statusState() {
        return this.store.current();
    }
    evaluate(provider, model, sessionId, now = this.now()) {
        const state = this.store.current();
        const base = evaluatePricing(this.policies, provider, model, now);
        const sessionProtection = sessionId !== undefined && state.sessions[sessionId]?.protection === 'off'
            ? 'off'
            : 'on';
        if (base.state === 'PEAK' && base.allowed === false) {
            if (sessionProtection === 'off') {
                return {
                    ...base,
                    allowed: true,
                    enabled: state.enabled,
                    sessionProtection,
                    reason: 'Session protection is off; verified peak inference is authorized for this session.',
                };
            }
            if (!state.enabled) {
                return {
                    ...base,
                    allowed: false,
                    enabled: false,
                    sessionProtection,
                    reason: 'Off-peak control is paused. Paid requests wait until /offpeak on.',
                };
            }
        }
        return {
            ...base,
            enabled: state.enabled,
            sessionProtection,
        };
    }
    async waitUntilAllowed(request) {
        const kind = request.kind ?? 'primary';
        const signal = request.signal;
        let holdId;
        try {
            while (true) {
                if (this.disposed)
                    throw new Error('dsh-offpeak is disposed');
                signal?.throwIfAborted();
                const now = this.now();
                const decision = this.evaluate(request.provider, request.model, request.sessionId, now);
                if (decision.allowed)
                    return decision;
                if (holdId === undefined) {
                    holdId = this.nextHoldId++;
                }
                this.holds.set(holdId, {
                    id: holdId,
                    sessionId: request.sessionId ?? '',
                    provider: request.provider,
                    model: request.model,
                    kind,
                    since: now,
                    ...(decision.nextTransition === undefined ? {} : { nextTransition: decision.nextTransition }),
                });
                const waiter = { controller: new AbortController() };
                this.waiters.add(waiter);
                const onAbort = () => waiter.controller.abort(signal?.reason);
                signal?.addEventListener('abort', onAbort, { once: true });
                let timer;
                const delay = decision.nextTransition === undefined
                    ? undefined
                    : Math.max(1, decision.nextTransition - now);
                if (delay !== undefined) {
                    // One boundary timer, never a polling loop.
                    timer = this.setTimer(() => waiter.controller.abort(new Error('pricing-boundary')), delay);
                }
                try {
                    await new Promise(resolve => {
                        waiter.controller.signal.addEventListener('abort', () => resolve(), { once: true });
                    });
                }
                finally {
                    signal?.removeEventListener('abort', onAbort);
                    if (timer !== undefined)
                        this.clearTimer(timer);
                    this.waiters.delete(waiter);
                }
                signal?.throwIfAborted();
            }
        }
        finally {
            if (holdId !== undefined)
                this.holds.delete(holdId);
        }
    }
    wakeWaiters() {
        for (const waiter of this.waiters)
            waiter.controller.abort(new Error('policy-changed'));
        this.waiters.clear();
    }
    async setEnabled(enabled) {
        const next = await this.store.update(state => ({ ...state, enabled }));
        this.wakeWaiters();
        return next;
    }
    async setSessionProtection(sessionId, protection) {
        if (sessionId.length === 0)
            throw new Error('session id is required');
        const next = await this.store.update(state => {
            const sessions = { ...state.sessions };
            if (protection === 'off')
                sessions[sessionId] = { protection: 'off', updatedAt: this.now() };
            else
                delete sessions[sessionId];
            return { ...state, sessions };
        });
        this.wakeWaiters();
        return next;
    }
    activeHolds() {
        return [...this.holds.values()].sort((left, right) => left.since - right.since);
    }
    formatDeadline(epochMs) {
        return formatTransitionInTimeZone(epochMs, this.displayTimeZone, this.now());
    }
    dispose() {
        this.disposed = true;
        this.wakeWaiters();
        this.holds.clear();
    }
}
