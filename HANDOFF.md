# Handoff

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
