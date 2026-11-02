/**
 * DeepSeek Harness native off-peak guard.
 *
 * The agent loop's `agent/request` waterfall parks a paid step before the
 * provider attempt exists; the LLM service's `llm/stream` waterfall covers
 * direct auxiliary calls such as compaction. Both wait on one boundary timer
 * and a shared wake signal, never on a polling loop.
 */
import { OffpeakEngine } from './engine.js';
import { BUILTIN_POLICIES, flatProviderNote, formatInTimeZone, isManagedProvider, MANAGED_PROVIDERS } from './policy.js';
import { OffpeakStateStore, resolveDshHome } from './state.js';
import { join } from 'node:path';
export const name = 'dsh-offpeak';
export const inject = ['llm', 'commands'];
const USAGE = [
    'Usage: /offpeak [status|on|off|session on|session off|pricing|help]',
    '',
    '  status        control, current route, pricing state, holds, session protection',
    '  on | off      guard on (queue peak-priced requests) or off (send them now)',
    '  session on    restore off-peak protection for this session (default)',
    '  session off   authorize verified peak inference for this session only',
    '  pricing       verified policies and the current route decision',
].join('\n');
function validateConfig(value) {
    if (value === undefined || value === null)
        return { enabled: true, displayTimeZone: 'UTC' };
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('dsh-offpeak: config must be an object');
    }
    const config = value;
    for (const key of Object.keys(config)) {
        if (!['enabled', 'displayTimeZone', 'statePath'].includes(key)) {
            throw new Error(`dsh-offpeak: unknown config key "${key}"`);
        }
    }
    if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
        throw new Error('dsh-offpeak: enabled must be a boolean');
    }
    if (config.displayTimeZone !== undefined && (typeof config.displayTimeZone !== 'string' || config.displayTimeZone.trim() === '')) {
        throw new Error('dsh-offpeak: displayTimeZone must be a non-empty IANA time zone');
    }
    if (config.statePath !== undefined && (typeof config.statePath !== 'string' || config.statePath.trim() === '')) {
        throw new Error('dsh-offpeak: statePath must be a non-empty path');
    }
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: config.displayTimeZone ?? 'UTC' }).format(0);
    }
    catch {
        throw new Error(`dsh-offpeak: invalid displayTimeZone "${config.displayTimeZone}"`);
    }
    return {
        enabled: config.enabled ?? true,
        displayTimeZone: config.displayTimeZone ?? 'UTC',
        ...(config.statePath === undefined ? {} : { statePath: config.statePath }),
    };
}
function stateLabel(decision) {
    switch (decision.state) {
        case 'PEAK': return 'PEAK';
        case 'OFF_PEAK': return 'OFF_PEAK';
        case 'FLAT': return 'FLAT';
        case 'UNTRACKED': return 'UNTRACKED';
        case 'UNKNOWN': return 'UNKNOWN (fail-closed)';
    }
}
function routeOf(agent) {
    const header = agent.session.requestHeader?.();
    return header?.config;
}
function formatStatus(engine, sessionId, route) {
    const state = engine.statusState();
    const now = Date.now();
    const lines = [];
    lines.push(`Off-peak guard: ${state.enabled ? 'ON' : 'OFF (peak dispatch allowed)'}`);
    lines.push(`Display time zone: ${engine.displayTimeZone}`);
    if (route === undefined) {
        lines.push('Current route: none recorded yet');
    }
    else {
        const decision = engine.evaluate(route.provider, route.model, sessionId, now);
        lines.push(`Current route: ${route.provider}/${route.model}`);
        lines.push(`Pricing: ${stateLabel(decision)}`);
        if (!isManagedProvider(route.provider)) {
            lines.push(`Scope: dsh-offpeak manages ${MANAGED_PROVIDERS.join(' and ')}; ${route.provider} is out of scope and is never intercepted, delayed, or authorized by this plugin.`);
        }
        else if (decision.policy !== undefined) {
            lines.push(`Policy: ${decision.policy.id} (${decision.policy.source}, verified ${decision.policy.verifiedAt ?? 'unknown'})`);
        }
        if (decision.reason !== undefined)
            lines.push(`Policy reason: ${decision.reason}`);
        if (decision.nextTransition !== undefined) {
            lines.push(`Next transition: ${engine.formatDeadline(decision.nextTransition)}`);
        }
        if (decision.state === 'UNTRACKED') {
            const note = flatProviderNote(route.provider);
            if (note !== undefined)
                lines.push(`Verified flat provider: ${note}`);
        }
        lines.push(`Request decision: ${decision.allowed ? 'ALLOWED' : 'WAITING'}`);
        if (decision.state === 'PEAK' && decision.sessionProtection === 'off') {
            lines.push('Session protection: OFF (explicit verified-peak authorization)');
        }
        else {
            lines.push('Session protection: ON (default)');
        }
    }
    const holds = engine.activeHolds();
    const sessionHolds = sessionId === undefined ? [] : holds.filter(hold => hold.sessionId === sessionId);
    lines.push(`Held requests: ${holds.length === 0 ? 'none' : `${holds.length} waiting for off-peak`}`);
    if (sessionHolds.length > 0) {
        const first = sessionHolds[0];
        lines.push(`This session: waiting since ${new Date(first.since).toISOString()}`);
        if (first.nextTransition !== undefined) {
            lines.push(`Release at: ${engine.formatDeadline(first.nextTransition)}`);
        }
    }
    if (sessionId !== undefined) {
        const override = state.sessions[sessionId]?.protection === 'off';
        lines.push(`This session override: ${override ? 'OFF' : 'none'}`);
    }
    return lines.join('\n');
}
function formatPricing(engine, route, sessionId) {
    const lines = ['Verified pricing policies:'];
    for (const policy of BUILTIN_POLICIES) {
        lines.push(`  ${policy.id}: providers ${policy.providers.join(', ')}; models ${policy.models.join(', ')}; peak windows ${policy.blocked.map(window => `${window.start}-${window.end} UTC`).join(', ')}; source ${policy.source}; verified ${policy.verifiedAt ?? 'unknown'}`);
        if (policy.flatModels !== undefined)
            lines.push(`    flat models: ${policy.flatModels.join(', ')}`);
        lines.push(`    holidays: ${(policy.holidays ?? []).map(calendar => `${calendar.year} (${calendar.dates.length} dates, ${calendar.timeZone})`).join(', ') || 'none'}`);
    }
    if (route !== undefined) {
        const decision = engine.evaluate(route.provider, route.model, sessionId);
        lines.push('');
        lines.push(`Current ${route.provider}/${route.model}: ${stateLabel(decision)} (${decision.allowed ? 'allowed' : 'waiting'})`);
        if (decision.nextTransition !== undefined) {
            lines.push(`Next transition: ${engine.formatDeadline(decision.nextTransition)} (${formatInTimeZone(decision.nextTransition, engine.displayTimeZone)})`);
        }
    }
    return lines.join('\n');
}
function parseArgs(raw) {
    return raw.trim().toLowerCase().split(/\s+/u).filter(Boolean);
}
function createUiBridge(ctx) {
    const service = (name) => {
        try {
            return ctx.get(name);
        }
        catch {
            return undefined;
        }
    };
    const status = service('tuiStatus');
    const toast = service('tuiToast');
    return {
        setStatus(text) {
            if (status === undefined || typeof status.set !== 'function')
                return;
            try {
                status.set('offpeak', text);
            }
            catch {
                /* a status contribution must never break the guard */
            }
        },
        toast(text, color = 'warning', timeoutMs = 8000) {
            if (toast === undefined || typeof toast.show !== 'function')
                return;
            try {
                toast.show(text, { color, timeoutMs });
            }
            catch {
                /* a toast must never break the guard */
            }
        },
    };
}
function handleCommand(engine, invocation, onControlChange) {
    const args = parseArgs(invocation.rawInput);
    const sessionId = invocation.agent.session.id;
    const route = routeOf(invocation.agent);
    const [first, second] = args;
    if (first === undefined || first === 'status') {
        return { kind: 'success', text: formatStatus(engine, sessionId, route) };
    }
    if (first === 'help')
        return { kind: 'success', text: USAGE };
    if (first === 'pricing')
        return { kind: 'success', text: formatPricing(engine, route, sessionId) };
    if (first === 'on' || first === 'off') {
        if (second !== undefined)
            return { kind: 'error', text: USAGE };
        return engine.setEnabled(first === 'on').then(state => {
            onControlChange?.();
            return {
                kind: 'success',
                text: state.enabled
                    ? 'Off-peak guard ON. Peak-priced requests are queued until the next off-peak boundary.'
                    : 'Off-peak guard OFF. Peak-priced requests are dispatched immediately; nothing is held.',
            };
        });
    }
    if (first === 'session') {
        if (second === 'on' || second === 'off') {
            return engine.setSessionProtection(sessionId, second).then(() => {
                onControlChange?.();
                return {
                    kind: 'success',
                    text: second === 'off'
                        ? 'Session off-peak protection is OFF. This session may use verified peak-priced inference; other sessions stay protected. UNKNOWN models still fail closed.'
                        : 'Session off-peak protection is ON. Peak-priced requests in this session wait for off-peak.',
                };
            });
        }
        return { kind: 'error', text: USAGE };
    }
    return { kind: 'error', text: USAGE };
}
export async function apply(ctx, rawConfig) {
    const config = validateConfig(rawConfig);
    const store = new OffpeakStateStore(config.statePath ?? join(resolveDshHome(), 'offpeak', 'state.json'));
    await store.load();
    if (store.current().enabled !== config.enabled) {
        await store.update(state => ({ ...state, enabled: config.enabled }));
    }
    const engine = new OffpeakEngine({
        store,
        displayTimeZone: config.displayTimeZone,
    });
    const service = {
        evaluate: (provider, model, sessionId) => engine.evaluate(provider, model, sessionId),
        waitUntilAllowed: (request) => engine.waitUntilAllowed(request),
        status: () => ({ ...engine.statusState(), holds: engine.activeHolds() }),
        activeHolds: () => engine.activeHolds(),
    };
    ctx.effect(() => () => engine.dispose(), 'dsh-offpeak engine');
    ctx.effect(() => ctx.provide('offpeak', service), 'dsh-offpeak service');
    const ui = createUiBridge(ctx);
    const statusLine = () => {
        const holds = engine.activeHolds();
        if (!engine.statusState().enabled)
            return 'offpeak: OFF · peak spend allowed';
        if (holds.length === 0)
            return 'offpeak: on';
        const first = holds[0];
        const count = holds.length > 1 ? ` ×${holds.length}` : '';
        const release = first.nextTransition === undefined ? '' : ` · releases ${engine.formatDeadline(first.nextTransition)}`;
        return `offpeak: PEAK hold${count}${release} · /offpeak off to send now`;
    };
    const refreshStatus = () => ui.setStatus(statusLine());
    refreshStatus();
    ctx.on('agent/request', async (payload, next) => {
        const resolved = await next();
        // Ownership boundary: any unmanaged provider passes through untouched.
        if (!isManagedProvider(resolved.provider))
            return resolved;
        const sessionId = payload.agent.session.id;
        const decision = engine.evaluate(resolved.provider, resolved.model, sessionId);
        if (decision.allowed)
            return resolved;
        const release = decision.nextTransition === undefined
            ? ''
            : ` until ${engine.formatDeadline(decision.nextTransition)}`;
        ui.toast(`Peak pricing: ${resolved.provider}/${resolved.model} is queued${release}. `
            + 'Run /offpeak off to send now, or /offpeak session off to allow peak for this session.', 'warning', 10000);
        await engine.waitUntilAllowed({
            provider: resolved.provider,
            model: resolved.model,
            sessionId,
            kind: 'primary',
            signal: payload.signal,
            onHoldChange: refreshStatus,
        });
        return resolved;
    }, { prepend: true });
    ctx.on('llm/stream', (options, next) => {
        if (!isManagedProvider(options.provider))
            return next();
        const decision = engine.evaluate(options.provider, options.model, options.sessionId);
        if (decision.allowed)
            return next();
        const kind = options.purpose === 'compaction' ? 'compaction' : options.purpose === 'session-title' ? 'title' : 'auxiliary';
        return (async function* guarded() {
            await engine.waitUntilAllowed({
                provider: options.provider,
                model: options.model,
                sessionId: options.sessionId,
                kind,
                signal: options.signal,
                onHoldChange: refreshStatus,
            });
            yield* next();
        })();
    });
    ctx.commands.register({
        name: 'offpeak',
        description: 'Inspect or control the verified paid-provider off-peak pricing guard',
        handler: (invocation) => handleCommand(engine, invocation, refreshStatus),
    });
    ctx.logger.info(`dsh-offpeak: loaded (${config.enabled ? 'on' : 'off'}, display ${config.displayTimeZone}, providers ${MANAGED_PROVIDERS.join(', ')})`);
}
