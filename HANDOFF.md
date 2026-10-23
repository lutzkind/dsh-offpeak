# Handoff

## 2026-10-23 — initial native implementation

Status: implementation complete, repository release pending host installation.

- Source: this repository.
- Runtime: DeepSeek Harness 0.2.1-rc.2 on Node 24.
- Verified seam: `agent/request` parks primary steps; `llm/stream` parks direct
  auxiliary calls. The title provider bypasses both and is configured on the
  free Zen route.
- Tests: `npm run check` (policy, engine, plugin wiring; no provider traffic).
- Host install: `dsh plugin --profile <profile> add <tag>` then mount the row in
  the host patch. See the server handoff for the live profile and verification.
