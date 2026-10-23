# Changelog

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
