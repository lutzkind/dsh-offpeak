# Architecture

`dsh-offpeak` is one DeepSeek Harness plugin package with three layers:

1. `src/policy.ts` — pure verified OpenCode Go pricing policy, holiday
   calendar, provider boundary, and `evaluatePricing()`.
2. `src/engine.ts` — one process-local guard: holds, one boundary timer per
   hold, a shared wake signal, and durable control/session state.
3. `src/index.ts` — Harness wiring: `agent/request`, `llm/stream`, the
   `offpeak` service, and `/offpeak` commands.

## Provider boundary

The package owns exactly one provider: `opencode-go`.

```text
provider == opencode-go  -> policy evaluation and possible hold
provider != opencode-go  -> immediate pass-through, untouched
```

Both waterfalls short-circuit before evaluation for any other provider, so the
plugin cannot hold, delay, fail closed, authorize, deny, or mutate a
`deepseek` (direct API) or `opencode` (Zen) request. `BUILTIN_POLICIES` contains
only `deepseek-opencode-go`; there is no registered direct-DeepSeek policy.
Direct DeepSeek is a separately configured provider in the host profile and is
selected only by explicit user action. There is no cross-provider fallback.

## Request path

```text
agent step -> agent/request waterfall (offpeak) -> next() -> free-first route
           -> if PEAK: park on boundary timer (no provider attempt)
           -> if allowed: return config -> Harness logs header and dispatches

compaction / direct ctx.llm.stream()
           -> llm/stream waterfall (offpeak) -> if PEAK: park -> then next()
```

The primary path deliberately uses `agent/request`, not `llm/stream`: the agent
loop dispatches a prepared call directly, bypassing the `llm/stream` waterfall.

The title provider is a known exception: it calls `llm.prepareCall()` and
`preparedCall.stream()` directly, so neither waterfall sees it. The host
configuration points titles at a free/flat route instead of adding a third
interception mechanism.

## State

`$DSH_HOME/offpeak/state.json` is one atomic document:

```json
{ "version": 1, "enabled": true, "sessions": { "<id>": { "protection": "off", "updatedAt": 0 } } }
```

Only explicit opt-outs are stored; absence means protection is on. Holds live
in memory because they belong to a live turn. A process restart fails the turn
closed like any other interrupted request; resuming the session re-enters the
policy.

## Timing

`waitUntilAllowed()` evaluates, registers one hold, schedules one timer for
`nextTransition`, and waits on either that timer or a shared wake signal from a
control change. It re-evaluates after every wake. There is no polling.

## Service

The plugin provides `ctx.offpeak`:

```ts
evaluate(provider, model, sessionId?) -> decision
waitUntilAllowed({ provider, model, sessionId?, kind?, signal? }) -> decision
status() -> control state plus active holds
activeHolds() -> hold records
```

`@lutzkind/dsh-free-first` uses this interface for paid timing. It does not
duplicate the policy. The service evaluates any route it is asked about, but
the shipped waterfalls only call it for `opencode-go`; free-first only asks
about its configured OpenCode Go fallback.

## Non-goals

No queue, scheduler, daemon, database, proxy, dashboard, or second agent
runtime. No byte-for-byte replay of an accepted request. No recall of a request
already in flight.
