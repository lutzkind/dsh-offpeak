# dsh-offpeak

DeepSeek Harness (`dsh`) native off-peak pricing guard for the OpenCode Go
subscription and the direct DeepSeek API.

`dsh-offpeak` parks a paid model request before the provider attempt exists
when the route is inside a verified DeepSeek peak window. The same request,
session, and turn continue when off-peak pricing returns. There is no second
prompt, no duplicate session, no synthetic continuation, and no provider
traffic while the request is waiting.

```
paid request -> verified PEAK -> park before dispatch -> boundary timer -> same request continues
```

## Install

```sh
dsh plugin --profile web add git+https://github.com/lutzkind/dsh-offpeak.git#v0.1.0
dsh plugin --profile headless add git+https://github.com/lutzkind/dsh-offpeak.git#v0.1.0
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
  route (`opencode` / `deepseek-v4.1-flash-free`) so it cannot create paid peak
  traffic.

## Policy

The built-in policies are verified vendor facts:

| Policy | Provider | Peak models | Schedule |
|---|---|---|---|
| `deepseek-opencode-go` | `opencode-go` | `deepseek-v4.1-flash`, `deepseek-v4-pro`, `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp` | 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday |
| `deepseek-api` | `deepseek` | `deepseek-flash`, `deepseek-v4-pro`, `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp` | identical |

Weekends and Chinese statutory public holidays are full-day off-peak. The
shipped holiday calendar is the 2026 State Council notice; a year without a
calendar keeps the deterministic weekday schedule. Every other documented
`opencode-go` model is explicitly flat-priced and is never delayed, including
the OpenCode Go `beam-free` route. A model
that matches neither the peak list nor the flat list under a configured
provider evaluates `UNKNOWN` and fails closed at every hour. A provider with no
policy evaluates `UNTRACKED` and is not guarded.

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

- `status` shows the control toggle, current route, pricing state, next
  transition, held requests, and this session's protection.
- `on` / `off` resume or pause paid dispatch. `off` never authorizes peak
  pricing: a held request stays held until the guard is on again.
- `session off` authorizes verified peak-priced inference for the current
  session only. `UNKNOWN` models still fail closed, and other sessions and
  background work are unaffected. `session on` restores the default.
- `pricing` prints the verified policies and the current route decision.

Session overrides persist in `$DSH_HOME/offpeak/state.json` (mode 0600). The
control toggle and overrides survive restarts. A hold itself is not persisted:
a process restart cancels the in-flight turn exactly like any other interrupted
Harness request, and resuming the session re-enters the same policy.

## Interaction with free-first

`@lutzkind/dsh-free-first` asks this package's `offpeak` service whether the
paid fallback may run. When the free route is unavailable and the paid route is
peak-priced, free-first waits for either free recovery or the pricing boundary
and then continues once, on the route that became available. Off-peak remains
the only owner of time/price policy; free-first owns only free-route health.

## Guarantees and limits

- No background polling loop. One timer is scheduled for the policy's next
  transition, plus a wake signal when the operator changes control state.
- No HTTP proxy, daemon, database, queue, or second agent runtime.
- A request already accepted by a provider before a boundary cannot be
  recalled.
- The Harness title provider bypasses `llm/stream`; use a free/flat title route.
- Peak windows and holidays are vendor data. Re-verify them before extending a
  policy; an unlisted model is deliberately blocked.

## Development

```sh
npm ci
npm run check
npm pack --dry-run
```

Tests are deterministic and clock-injected; they never send provider traffic.
