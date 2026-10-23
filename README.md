# dsh-offpeak

DeepSeek Harness (`dsh`) native off-peak pricing guard for the two paid
providers: **OpenCode Go** (`opencode-go`) and the official **DeepSeek Direct
API** (`deepseek`).

`dsh-offpeak` parks a paid model request before the provider attempt exists when
the route is inside that provider's verified peak window. The same request,
session, and turn continue when off-peak pricing returns. There is no second
prompt, no duplicate session, no synthetic continuation, and no provider
traffic while the request is waiting.

```
paid request -> provider-specific verified PEAK -> park before dispatch
             -> boundary timer -> same request continues
```

Provider-specific pricing policies stay separate, even while their current
windows happen to match. The direct provider remains explicit/manual selection
only; `dsh-offpeak` guards it but never selects it, and there is no automatic
fallback between OpenCode Go and Direct DeepSeek.

## Install

```sh
for profile in headless web acp sdk; do
  dsh plugin --profile "$profile" add git+https://github.com/lutzkind/dsh-offpeak.git#v0.2.1
done
```

Mount it in the profile or host patch:

```yaml
- insert:
    - id: dsh-offpeak
      name: '@lutzkind/dsh-offpeak'
      config:
        enabled: true
        displayTimeZone: UTC
```

The package has no runtime dependency on an OpenCode plugin API. It uses the
Harness's own `agent/request` and `llm/stream` waterfalls.

## What it covers

- **Primary agent steps** — the `agent/request` waterfall holds the step before
  the system prompt and accepted user batch are committed and before the
  provider attempt exists.
- **Direct auxiliary model calls** — the `llm/stream` waterfall covers
  compaction and other direct `ctx.llm.stream()` consumers.
- **Titles** — the shipped title provider uses `prepareCall()` directly, which
  bypasses both waterfalls. Configure the title provider on a free or flat
  OpenCode Go route (`opencode-go` / `beam-free`) so it cannot create paid peak
  traffic.

## Scope

The plugin owns exactly two paid providers: `opencode-go` and `deepseek`.

```text
provider == opencode-go  -> OpenCode Go policy may apply
provider == deepseek     -> DeepSeek Direct API policy may apply
provider == anything else -> pass through untouched
```

OpenCode Zen (`opencode`) remains out of scope. For any unmanaged provider the
plugin does not intercept, delay, fail closed, authorize, deny, or mutate
routing.

Direct DeepSeek remains an explicit/manual provider choice in the Harness. The
plugin does not select it, does not fall back to it, and cannot turn an OpenCode
Go hold into a Direct request. It only enforces the verified Direct API timing
policy once that route is already chosen.

## Policies

Both built-in policies are verified vendor facts, with independent sources and
model coverage:

| Policy | Provider | Peak models | Peak schedule | Source | Verified |
|---|---|---|---|---|---|
| `deepseek-opencode-go` | `opencode-go` | `deepseek-v4.1-flash`, `deepseek-v4-pro`, `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp` | 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday | `https://opencode.ai/docs/go/` | 2026-10-23 |
| `deepseek-api` | `deepseek` | `deepseek-flash`, `deepseek-v4-pro`, plus legacy `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` aliases billed at the Flash price | 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday, excluding Chinese public holidays | `https://api-docs.deepseek.com/quick_start/pricing` | 2026-10-23 |

The Direct policy was re-verified from the official pricing page on 2026-10-23:
off-peak rates are 50% of peak rates; weekends and Chinese public holidays are
off-peak in full; `deepseek-flash` and `deepseek-v4-pro` are the current models,
and the legacy Flash names are still accepted. The OpenCode Go policy is
verified from its own Go model table, which publishes separate DeepSeek
peak/off-peak rows.

Every other documented `opencode-go` model is explicitly flat-priced and is
never delayed, including the `beam-free` route. A model that matches neither the
peak list nor the flat list under a managed provider evaluates `UNKNOWN` and
fails closed at every hour. An unmanaged provider evaluates `UNTRACKED` and is
not guarded.

The shipped holiday calendar is the 2026 State Council notice; a year without a
calendar keeps the deterministic weekday schedule. Re-verify vendor facts before
extending a policy.

## Commands

```text
/offpeak status
/offpeak on
/offpeak off
/offpeak session on
/offpeak session off
/offpeak pricing
/offpeak help
```

- `status` shows the control toggle, current route, pricing state, policy id,
  next transition, held requests, and this session's protection.
- `on` / `off` resume or pause paid dispatch for both managed providers. `off`
  never authorizes peak pricing: a held request stays held until the guard is on
  again.
- `session off` authorizes verified peak-priced inference for the current
  session only, on either managed provider. `UNKNOWN` models still fail closed,
  and other sessions and background work are unaffected. `session on` restores
  the default.
- `pricing` prints both verified policies and the current route decision.

Session overrides persist in `$DSH_HOME/offpeak/state.json` (mode 0600). The
control toggle and overrides survive restarts. A hold itself is not persisted:
a process restart cancels the in-flight turn exactly like any other interrupted
Harness request, and resuming the session re-enters the same policy.

## Interaction with free-first

`@lutzkind/dsh-free-first` owns OpenCode Go free-route health only. It asks this
package's `offpeak` service whether its paid OpenCode Go fallback may run. When
that fallback is peak-priced, free-first waits for either free recovery or the
pricing boundary and then continues once, on the route that became available.

`dsh-free-first` never intercepts, fails over, probes, or keeps health state for
`deepseek/...`. A manually selected Direct request is guarded only by
`dsh-offpeak`; it never participates in free-first routing and is never used as
a cross-provider fallback.

## Guarantees and limits

- No background polling loop. One timer is scheduled for the policy's next
  transition, plus a wake signal when the operator changes control state.
- No HTTP proxy, daemon, database, queue, or second agent runtime.
- A request already accepted by a provider before a boundary cannot be
  recalled.
- The Harness title provider bypasses `llm/stream`; use a free/flat title route.
- Peak windows and holidays are vendor data. Re-verify them before extending a
  policy; an unlisted managed-provider model is deliberately blocked.

## Development

```sh
npm ci
npm run check
npm pack --dry-run
```

Tests are deterministic and clock-injected; they never send provider traffic.
