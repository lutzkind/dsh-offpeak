# Architecture

`dsh-offpeak` is one DeepSeek Harness plugin package with three layers:

1. `src/policy.ts` — pure verified OpenCode Go and DeepSeek Direct API pricing
   policies, holiday calendar, provider boundary, and `evaluatePricing()`.
2. `src/engine.ts` — one process-local guard: holds, one boundary timer per
   hold, a shared wake signal, and durable control/session state.
3. `src/index.ts` — Harness wiring: `agent/request`, `llm/stream`, the
   `offpeak` service, and `/offpeak` commands.

## Provider boundary

The package owns exactly two paid providers: `opencode-go` and `deepseek`.

```text
provider == opencode-go  -> OpenCode Go policy evaluation and possible hold
provider == deepseek     -> Direct API policy evaluation and possible hold
provider == anything else -> immediate pass-through, untouched
```

Both waterfalls short-circuit before evaluation for any unmanaged provider, so
the plugin cannot hold, delay, fail closed, authorize, deny, or mutate an
`opencode` (Zen) request or any other route.

Direct DeepSeek is a separately configured provider in the host profile and is
selected only by explicit user action. `dsh-offpeak` enforces the Direct API
timing policy on that route but never selects it. There is no automatic
OpenCode Go -> Direct fallback, and a hold never changes the provider.

`BUILTIN_POLICIES` contains two distinct policies:

- `deepseek-opencode-go` — provider `opencode-go`, source
  `https://opencode.ai/docs/go/`;
- `deepseek-api` — provider `deepseek`, source
  `https://api-docs.deepseek.com/quick_start/pricing`.

The current peak windows match, but the policies, model lists, sources, and
verification dates remain separate. A change to one vendor's schedule must not
silently alter the other provider.

`@lutzkind/dsh-free-first` is a separate plugin with a stricter boundary: it
manages `opencode-go` only and bypasses `deepseek/...` completely. It does not
share health or failover state with this package.

## Request path

```text
agent step -> agent/request waterfall (offpeak) -> next() -> free-first route
           -> if managed provider and PEAK: park on boundary timer
           -> if allowed: return config -> Harness logs header and dispatches

compaction / direct ctx.llm.stream()
           -> llm/stream waterfall (offpeak)
           -> if managed provider and PEAK: park -> then next()
```

The primary path deliberately uses `agent/request`, not `llm/stream`: the agent
loop dispatches a prepared call directly, bypassing the `llm/stream` waterfall.

The title provider is a known exception: it calls `llm.prepareCall()` and
`preparedCall.stream()` directly, so neither waterfall sees it. The host
configuration points titles at a free/flat OpenCode Go route instead of adding a
third interception mechanism.

## State

`$DSH_HOME/offpeak/state.json` is one atomic document:

```json
{ "version": 1, "enabled": true, "sessions": { "<id>": { "protection": "off", "updatedAt": 0 } } }
```

Only explicit opt-outs are stored; absence means protection is on. Holds live
in memory because they belong to a live turn. A process restart fails the turn
closed like any other interrupted request; resuming the session re-enters the
policy. Controls are session-scoped, not provider-scoped: a session opt-out
applies to whichever managed paid provider that session uses.

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

`@lutzkind/dsh-free-first` uses this interface only for its OpenCode Go paid
fallback. It does not duplicate pricing policy. The service evaluates any route
it is asked about, but free-first never asks about `deepseek/...`; a Direct
request is guarded solely by the installed waterfalls.

## Non-goals

No queue, scheduler, daemon, database, proxy, dashboard, or second agent
runtime. No byte-for-byte replay of an accepted request. No recall of a request
already in flight. No cross-provider fallback or provider selection.
