# Changelog

## 0.2.1 — 2026-10-23

- Restore native pricing management for the official DeepSeek Direct API
  (`deepseek`). The plugin now manages both paid providers: `opencode-go` and
  `deepseek`.
- Add a separate `deepseek-api` policy with its own source, model coverage, and
  verification date. Freshly verified 2026-10-23: peak 01:00–04:00 and
  06:00–10:00 UTC Monday–Friday, excluding Chinese public holidays; weekends and
  holidays off-peak in full; `deepseek-flash` and `deepseek-v4-pro` current,
  with legacy Flash aliases still accepted.
- Direct DeepSeek remains explicit/manual selection only. The plugin holds a
  Direct request at peak but never selects it or falls back to it.
- `dsh-free-first` is unchanged and remains OpenCode Go-only; it never
  intercepts, probes, or keeps health state for Direct DeepSeek.
- `/offpeak` global and session controls apply to either managed paid provider.
- Tests cover both provider policies, provider-specific windows, Direct holds,
  controls, unknown models, and the free-first boundary.

## 0.2.0 — 2026-10-23

- **Breaking scope change:** the shipped plugin now manages the `opencode-go`
  provider only. The direct DeepSeek API (`deepseek`) policy was removed.
- `deepseek` and every other provider pass through both waterfalls untouched:
  no evaluation, hold, delay, fail-closed decision, or routing mutation.
- `BUILTIN_POLICIES` contains exactly `deepseek-opencode-go`; no direct-DeepSeek
  policy is registered.
- Existing OpenCode Go semantics are unchanged: peak windows, holidays, flat
  models, fail-closed unknown Go models, control toggle, and session override.

## 0.1.1 — 2026-10-23

- Add `beam-*` to the explicitly verified flat OpenCode Go models so the
  OpenCode Go `beam-free` route is never held at peak. The Zen free tier is
  gated to OpenCode clients; an OpenCode Go free model is usable by DSH.

## 0.1.0 — 2026-10-23

- First DeepSeek Harness native release.
- Verified DeepSeek OpenCode Go and direct API peak windows, flat models, and
  2026 Chinese holiday calendar.
- Primary `agent/request` hold and auxiliary `llm/stream` hold.
- Session-scoped explicit peak authorization.
- `ctx.offpeak` service for free-first.
- `/offpeak` status, control, pricing, and session commands.
