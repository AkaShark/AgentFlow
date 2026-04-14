# AgentFlow Roadmap

Living document. Items are ordered roughly by priority, not strict sequence. Edit freely as scope shifts.

## Current state (MVP ✅)

- Static scan of Claude Code projects (skills / agents / commands / hooks / builtin tools)
- Plugin discovery (enabled plugins from `~/.claude/plugins/`)
- Runtime event capture via hook forwarder → JSONL → Postgres
- Three core views: Flowchart (G6) / Timeline (flat event stream) / Table
- Projects management page with auto-install-hooks checkbox
- Cross-view selection (pin resource → filter Timeline)
- Session Replay scrubber (highlights active nodes in Flowchart)
- About page
- Docker + Podman compatible

## Next directions

Four meaningful directions, each described with **goal · value · scope · approach · risk · effort**.

---

### 1. Call Tree / Span view ⭐⭐⭐⭐

**Goal** — replace the flat event stream with a structured call tree that reflects how Claude actually used tools in a session. APM-style: one session = one trace, nested spans for nested calls, duration bars.

**Value** — users can finally see patterns like "Claude read the same file 4 times" or "the Edit tool took 12s for a 3-line change". The visual upgrade alone (flame chart / waterfall) makes AgentFlow feel like a real observability tool instead of a log viewer.

**Scope**
- Server: pair `PreToolUse` / `PostToolUse` events by `tool_use_id` (or sequence order as fallback), compute `durationMs`, build a tree per session. Root is `SessionStart`, children are Top-level tool calls, grandchildren are tool calls made from inside subagents (Task tool).
- New API: `GET /api/sessions/:sessionId/tree?projectId=` → returns nested `CallSpan[]`.
- Frontend: new `/trace` view. Session picker → collapsible tree → each row shows icon · name · duration bar (relative to session length).
- Integration: click a span → selection store → same DetailDrawer.

**Approach** — stack-based tree builder. Walk events chronologically, maintain a stack of open spans, pop on matching `*_returned` / `*_completed`. If a new open event arrives while the stack is non-empty, nest it under the top.

**Risk** — low. The Pre/Post pairing is deterministic given `tool_use_id`. The only uncertainty is that simulated events don't always have `tool_use_id`; we fall back to "next matching type within same session".

**Effort** — ~1 day. Backend service + endpoint + Vue view + CSS.

**Status** — 🚧 **in progress**

---

### 2. MCP server discovery ⭐⭐⭐

**Goal** — AgentFlow currently only sees local skills/agents/commands/hooks + enabled plugins. Claude Code also connects to MCP servers (`~/.claude/mcp_settings.json`), each exposing its own tools and resources. These should appear as first-class nodes in the graph.

**Value** — dashboard finally reflects *all* the capabilities a Claude session can reach, not just local files. MCP tools that fire events (which currently get lazy-created as unknown tools) now have proper metadata (server name, description, schema).

**Scope**
- Adapter: read `~/.claude/mcp_settings.json` + per-project `.claude/mcp_settings.json` for enabled servers
- For each MCP server, introspect its tool list (either from config file or via live `list_tools` RPC)
- Emit synthetic `mcp-server` resource (new type or subtype) + one `tool` resource per MCP tool
- Relation: every tool belongs to its server (new edge kind `belongsTo`)
- Frontend: tool nodes get a server badge in DetailDrawer

**Approach** — start with static config parsing. Live RPC introspection is v2. Treat each MCP server as a "scope" like `plugin`.

**Risk** — medium. MCP config format might differ between users / Claude versions. Also: live introspection requires spawning the MCP server process, which has side effects.

**Effort** — 1-2 days.

**Status** — planned

---

### 3. Cross-session Analytics dashboard ⭐⭐⭐

**Goal** — aggregate view across all sessions in a project (or across all projects) so users can see trends rather than individual calls.

**Value** — turns AgentFlow from a "look at one session" tool into a "understand my AI workflow over weeks" tool. Great for identifying zombie resources, slow hooks, over-used tools, drift in session patterns.

**Scope**
- New `/insights` route
- Panels (each = one SQL aggregation):
  - Top 10 tools / skills / agents by trigger count (last 7 / 30 days)
  - Zombie detection: resources with 0 events in the last N days
  - Hook latency P50/P95 bar chart
  - Tool call histogram by hour-of-day (usage heatmap)
  - Session length distribution
  - Session count per day trend line

**Approach** — server exposes `/api/insights/*` endpoints backed by Prisma group-by queries. Frontend uses a lightweight chart library (ECharts or Chart.js). Keep it dark / tech aesthetic consistent with the rest of the dashboard.

**Risk** — low. Data is already in Postgres.

**Effort** — 2 days (mostly frontend chart styling).

**Status** — planned

---

### 4. Multi-adapter (Cursor / Cline / Codex / Gemini CLI) ⭐⭐

**Goal** — fulfill the original "works with any AI coding agent" promise by shipping at least one non-Claude adapter.

**Value** — strategic for open source: instead of being "a Claude Code side-tool", AgentFlow becomes "the cross-agent observability layer". This opens up a much larger user base and validates the adapter abstraction.

**Scope** — pick **Cursor** as the first target (largest non-Claude user base, uses `.cursor/rules/` which is plain markdown, hook support via community `.cursor/hooks/` convention).

- New package `packages/adapters/cursor/`
- Implement `AgentAdapter` interface: `detect` / `discoverResources` / `parseResource` / `getInstrumentationSetup` / `parseEvent`
- Cursor has no native skills/agents/commands — just "rules" (treat as skills) and "modes" (treat as agents)
- Hook forwarder: same JSONL format, different spawn mechanism

**Approach** — run a fixture Cursor project through the new adapter first, verify scan + graph, then tackle instrumentation. Write end-to-end docs.

**Risk** — medium-high. Each new agent framework has its own quirks (Cline uses VS Code extension messaging, not files; Aider has no hooks at all). The adapter abstraction may need to stretch.

**Effort** — 3-5 days per adapter. Cursor first, then evaluate whether the abstraction survives.

**Status** — planned (consider delaying until after 1-3)

---

## Smaller follow-ups (do when it itches)

- [ ] **`Uninstall Hooks` button** symmetric to Install Hooks
- [ ] **Event list clips** for long resource IDs — display `tool:Read` instead of the full `@proj:...` suffix
- [ ] **Flowchart chunk size** — 1.4 MB JS bundle is mostly G6; consider code-splitting or lazy-loading G6
- [ ] **`npx agentflow init` CLI** — covered in installation docs, not yet implemented
- [ ] **Claude Code plugin packaging** — zero-config install path
- [ ] **Dashboard i18n** — Chinese UI (English is default)
- [ ] **Dark/light theme toggle** — currently dark only
- [ ] **Replay playback speed controls** — 0.5x / 1x / 2x / 4x
- [ ] **Export session as .png/.mp4** — for sharing screenshots and demos

## Questions / open decisions

- Should AgentFlow support **multi-tenant** deployments (team / cloud) or stay single-user local?
- Should we **bake in OTLP export** so analytics flows into Grafana / Honeycomb / Datadog instead of reinventing charts?
- Should the **Replay** feature support stepping through events one at a time (⏪/⏩ buttons) in addition to the scrubber?
