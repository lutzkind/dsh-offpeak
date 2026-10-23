# Handoff

## 2026-10-23 — Restore DeepSeek Direct API management

Status: released `v0.2.1`, installed in the live host profiles `web`, `headless`, `acp`, and `sdk`, verified.

- Source: this repository.
- Runtime: DeepSeek Harness 0.2.1-rc.2 on Node 24.
- Scope correction: the plugin manages both paid providers again:
  `opencode-go` and `deepseek` (official Direct API). `opencode` (Zen) remains
  out of scope.
- Policies are separate: `deepseek-opencode-go` and `deepseek-api` have their
  own providers, models, sources, and verification dates even though the
  current windows match.
- Direct API policy freshly verified 2026-10-23 against
  `https://api-docs.deepseek.com/quick_start/pricing`: peak 01:00–04:00 and
  06:00–10:00 UTC, Monday–Friday, excluding Chinese public holidays; weekends
  and holidays off-peak in full; off-peak 50% of peak; current models
  `deepseek-flash`/`deepseek-v4-pro`, legacy Flash aliases still accepted.
- Direct DeepSeek stays explicit/manual selection only. The plugin holds Direct
  requests at peak but never selects the provider or falls back to it.
- `dsh-free-first` is unchanged and remains OpenCode Go-only; it never
  intercepts, probes, or maintains health for `deepseek/...`.
- Tests: `npm run check` (38 tests: both policies, provider-specific windows,
  Direct holds, global/session controls, unknown models, free-first boundary;
  no provider traffic).
- Release: `v0.2.1`; installed in `/root/.dsh/profiles/{web,headless,acp,sdk}`
  from the tag. The installed `dist/*.js` sha256 values match the tag.
- Host verification: `python3 /root/scripts/dsh_verify.py --live`,
  `node /root/scripts/dsh_verify_runtime.mjs`, and
  `node /root/scripts/dsh_verify_plugins.mjs`.

## 2026-10-23 — OpenCode Go-only provider boundary

Status: released `v0.2.0`, installed in the live host profiles `web`, `headless`, `acp`, and `sdk`, verified.

- Source: this repository.
- Runtime: DeepSeek Harness 0.2.1-rc.2 on Node 24.
- Scope change: only `opencode-go` is managed. The direct DeepSeek API policy
  (`deepseek-api`) was removed; `BUILTIN_POLICIES` contains only
  `deepseek-opencode-go`, and both waterfalls short-circuit for any other
  provider.
- Direct DeepSeek is a separate, explicitly selected provider with normal native
  Harness routing: no hold, delay, fail-closed decision, authorization, or
  routing mutation. No automatic fallback in either direction.
- Existing OpenCode Go semantics are unchanged: peak windows, 2026 holidays,
  flat models, unknown-model fail-closed, control toggle, and session override.
- Tests: `npm run check` (25 tests, provider boundary and bypass included; no
  provider traffic).
- Release: `v0.2.0`; installed in `/root/.dsh/profiles/{web,headless,acp,sdk}`
  from the tag. The installed `dist/*.js` sha256 values match the tag.
- Host verification: `python3 /root/scripts/dsh_verify.py --live`,
  `node /root/scripts/dsh_verify_runtime.mjs`, and
  `node /root/scripts/dsh_verify_plugins.mjs`.

## 2026-10-23 — initial native implementation

Status: released `v0.1.1`, installed in the live host profiles `web`, `headless`, `acp`, and `sdk`, verified.

- Source: this repository.
- Runtime: DeepSeek Harness 0.2.1-rc.2 on Node 24.
- Verified seam: `agent/request` parks primary steps; `llm/stream` parks direct
  auxiliary calls. The title provider bypasses both and is configured on the
  free/flat OpenCode Go `beam-free` route.
- Tests: `npm run check` (policy, engine, plugin wiring; no provider traffic).
- Release: `v0.1.1` (code and docs); main also carries the automated CI-standard
  workflow and the agent-friendliness contract fix.
- Host install: `/root/.dsh/profiles/{web,headless,acp,sdk}/package.json` pins this package
  to `#v0.1.1`; the rows are in each profile's `cordis.patch.yml`. The installed
  `dist/index.js` sha256 matches the tag.
- Host verification: `python3 /root/scripts/dsh_verify.py --live`,
  `node /root/scripts/dsh_verify_runtime.mjs`, and
  `node /root/scripts/dsh_verify_plugins.mjs`.
- Known limitation: the OpenCode Zen free tier refuses non-OpenCode clients; the
  host free route is the OpenCode Go zero-cost `beam-free` model instead.
