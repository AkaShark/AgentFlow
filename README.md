# AgentFlow

English · [中文](./README.zh-CN.md)

> Local web dashboard to visualize how AI agent **skills**, **subagents**, **commands**, and **hooks** are wired together and triggered at runtime.

AgentFlow points at any project that uses an AI coding agent (Claude Code first, more to come) and gives you three views:

- 📐 **Static Flowchart** — force-directed graph of every skill / agent / command / hook and how they relate
- ⏱ **Runtime Timeline** — real events captured via injected hooks, replayed on a horizontal axis
- 📋 **Resource Table** — every resource with trigger counts, sortable

## Stack

| Layer       | Tech |
|-------------|------|
| Monorepo    | pnpm workspaces |
| Backend     | Node 20 · Express · TypeScript · Prisma · PostgreSQL 15 |
| Frontend    | Vue 3 · Vite · TypeScript · Pinia · Naive UI · AntV G6 v5 |
| Runtime     | Hook-injected JSONL → file watcher → Postgres → WebSocket |
| Container   | Docker Compose (Podman compatible via wrapper) |

---

## 1. Prerequisites

- **Node.js ≥ 20** — `nvm install 20 && nvm use`
- **pnpm ≥ 9** — `npm i -g pnpm` or `corepack enable`
- **Container engine**: Docker Desktop / OrbStack **or** Podman 4.4+
- A real **Claude Code project** to point at (anything with a `.claude/` directory)

Check versions:

```bash
node -v        # v20.x
pnpm -v        # 9.x
docker --version || podman --version
```

---

## 2. First-time setup

```bash
# 1. install all workspace deps
pnpm install

# 2. start postgres (auto-detects docker or podman)
pnpm compose:up

# 3. configure server env
cp packages/server/.env.example packages/server/.env

# 4. apply database migrations
pnpm db:migrate
```

The `pnpm db:migrate` step:
- Runs `prisma migrate deploy` against the Postgres in your container
- Generates the Prisma client
- The initial migration lives at `packages/server/prisma/migrations/20260414000000_init/`

If you change `schema.prisma`, generate a new migration with:

```bash
cd packages/server
pnpm exec prisma migrate dev --name describe_your_change
```

---

## 3. Daily development

### Start everything

```bash
pnpm dev
```

This runs `pnpm -r --parallel run dev`, which starts:

| Process | Port | Purpose |
|---|---|---|
| `@agentflow/server` (tsx watch) | `4000` | Express API + WebSocket + JSONL ingester |
| `@agentflow/web` (vite) | `5173` | Vue dashboard with HMR |
| `@agentflow/core` (tsc -w) | — | Type-checks shared types in watch mode |
| `@agentflow/adapter-claude-code` (tsc -w) | — | Same |

Open <http://localhost:5173>.

### Add and scan a project

1. Open the **Projects** page (it's the default landing view)
2. Click **+ Add Project**
3. Paste an absolute path to a Claude Code project (must contain `.claude/` or `CLAUDE.md`)
4. Optional: leave **Install hook instrumentation now** checked (default) to also wire up runtime capture in one step
5. Click **Add & scan** — AgentFlow runs adapter detection, scans resources, optionally installs hooks, and selects the project
6. Open the **Flowchart** tab → click any node → DetailDrawer slides in with full metadata

### Capture runtime events

There are **two ways** to install the hook forwarder:

#### Option A — auto-install during Add Project (default, recommended)

The Add Project modal has a **Install hook instrumentation now** checkbox (on by default). When checked, AgentFlow will:
- Create the project record
- Run the static scan
- Immediately apply the instrumentation plan

After this, just **restart your Claude Code session** in that project directory and events start flowing.

#### Option B — manual via the dashboard

If you want to review what gets written first (or you skipped the checkbox above):

1. Select the project, click **Install Hooks** in the header
2. The modal shows every file and every JSON patch AgentFlow will write
3. Click **Apply** when you're satisfied
4. Restart your Claude Code session

#### What gets written

In both cases AgentFlow writes the same two things to your project root:

- **`<project>/.agentflow/hook-forwarder.mjs`** — a small Node.js script (~80 lines) with your AgentFlow `projectId` baked in. It reads each hook event payload from stdin and appends a JSON line to `~/.agentflow/events/<projectId>.jsonl`.
- **Patches `<project>/.claude/settings.json`** — adds entries to the `hooks` field for `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`. Existing hooks are preserved (deep merge, not overwrite).

Nothing is touched outside your project root and `~/.agentflow/`. No global state, no env-var wiring, no daemon.

#### How the capture actually works

AgentFlow does **not** inject anything into a running Claude Code process. It cooperates with Claude Code's native hook mechanism:

```
Claude Code session
      │ (you ask Claude to do something)
      ▼
Claude calls a tool (Read / Bash / Edit / ...)
      │
      │ matches PreToolUse hook in settings.json
      ▼
Claude Code spawns: node .agentflow/hook-forwarder.mjs PreToolUse
      │
      │ stdin: {"tool_name":"Read","tool_input":{...},"session_id":"..."}
      ▼
forwarder appends one JSONL line, exits in ~3ms
      │
      ▼
~/.agentflow/events/<projectId>.jsonl
      │
      │ chokidar file-watch
      ▼
AgentFlow Ingester → adapter.parseEvent() → Postgres
      │
      ├─→ /api/events for the Timeline view
      └─→ WebSocket /ws/events for live updates
```

#### Important: hooks are loaded at session start

Claude Code reads `.claude/settings.json` **once** when a session starts. After installing hooks, the **currently running session won't capture events** — it doesn't know about the new hooks. You must:

- Quit and restart Claude Code in that project, **or**
- Open a fresh terminal and start a new session — both sessions can run in parallel and only the new one captures events

#### Uninstall

There is no `Uninstall Hooks` button (yet). To remove instrumentation manually:

```bash
cd /path/to/your/project
git checkout .claude/settings.json     # if tracked
# or hand-edit and remove the AgentFlow entries
rm -rf .agentflow/
```

AgentFlow never modifies anything outside `.claude/settings.json` and `.agentflow/`, so cleanup is local to the project.

#### Future install paths (planned)

| Method | Status | Use case |
|---|---|---|
| Dashboard auto-install (Add Project checkbox) | ✅ shipped | Most users |
| Dashboard manual (Install Hooks button + preview) | ✅ shipped | Cautious users / re-install |
| `npx agentflow init` CLI | 🔜 v0.2 | "Init from project dir" workflow without opening the dashboard |
| Claude Code plugin (`claude plugins install agentflow`) | 🔜 v1+ | Zero-config, ships with the agent ecosystem |

### Container engine

`pnpm compose:*` auto-detects `docker compose` → `podman compose` → `podman-compose`. Force one:

```bash
AGENTFLOW_ENGINE=podman pnpm compose:up
```

---

## 4. Debugging

### 4.1 Backend (`@agentflow/server`)

```bash
# logs
pnpm --filter @agentflow/server dev   # tsx watch with stack traces

# typecheck only
pnpm --filter @agentflow/server typecheck

# inspect requests
curl http://localhost:4000/health
curl http://localhost:4000/api/projects
curl "http://localhost:4000/api/resources?projectId=<id>"
curl "http://localhost:4000/api/graph?projectId=<id>"
```

To attach a Node debugger, change the dev script in `packages/server/package.json`:

```json
"dev": "tsx watch --inspect=9229 src/index.ts"
```

Then attach VS Code or Chrome DevTools to `localhost:9229`.

### 4.2 Database

```bash
# open a psql shell against the container
docker exec -it agentflow-postgres psql -U agentflow -d agentflow
# or
podman exec -it agentflow-postgres psql -U agentflow -d agentflow

# Prisma Studio (visual table browser)
cd packages/server && pnpm exec prisma studio
```

Useful queries:

```sql
SELECT id, name, "rootPath", "adapterId" FROM "Project";
SELECT type, count(*) FROM "Resource" GROUP BY type;
SELECT type, count(*) FROM "Event"  GROUP BY type ORDER BY 2 DESC;
SELECT "sessionId", count(*) FROM "Event" GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
```

Wipe everything and re-migrate:

```bash
pnpm compose:down
docker volume rm agentflow_agentflow-pgdata    # or: podman volume rm ...
pnpm compose:up
pnpm db:migrate
```

### 4.3 Frontend (`@agentflow/web`)

- Vite HMR is on by default — save and the browser updates
- Vue DevTools (browser extension) shows the Pinia stores live: `project`, `selection`
- Network panel shows requests routed via the Vite proxy (`/api` → `:4000`, `/ws` → ws on `:4000`)
- Type-check separately:

  ```bash
  pnpm --filter @agentflow/web typecheck
  ```

Common gotchas:

- **CORS errors**: the Vite proxy must be running. If you call the API directly, the server allows all origins via `cors()`.
- **WebSocket disconnect**: check the server log; the Ingester crashes are usually the cause.
- **Naive UI dark theme not applied**: confirm `<NConfigProvider :theme="darkTheme">` wraps the app in `App.vue`.

### 4.4 Hook instrumentation

The hardest part to debug because it runs *inside* the target Claude Code session.

**Sanity check the forwarder**:

```bash
echo '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' \
  | AGENTFLOW_PROJECT_ID=test node <project>/.agentflow/hook-forwarder.mjs PreToolUse

# now check the file:
cat ~/.agentflow/events/test.jsonl
```

If a line appears, the forwarder works. If the dashboard still shows nothing, check:

1. The **Ingester** is watching the right directory:
   - Server log line: `[agentflow] watching events at /...`
   - Override with `AGENTFLOW_EVENTS_DIR=/abs/path` in `packages/server/.env`
2. The `projectId` in the JSONL matches a real `Project.id` in Postgres
3. The Adapter's `parseEvent` returns a non-null event for that line — you can test:

   ```bash
   pnpm --filter @agentflow/adapter-claude-code exec node -e \
     'import("./dist/parseEvent.js").then(m => console.log(m.parseClaudeEvent("LINE_HERE")))'
   ```

**Tail events live**:

```bash
tail -f ~/.agentflow/events/<projectId>.jsonl | jq .
```

**Uninstall hooks**: edit your project's `.claude/settings.json` and remove the `hooks` block, or use `git checkout`. AgentFlow will not auto-revert.

### 4.5 Adapter changes

Iterate on `packages/adapters/claude-code/`:

```bash
pnpm --filter @agentflow/adapter-claude-code dev   # tsc --watch
```

The server imports it as `workspace:*`, so changes propagate after the next server restart (which `tsx watch` does automatically when imports change).

To re-scan after adapter logic changes:

```bash
curl -X POST http://localhost:4000/api/projects/<id>/scan
```

---

## 5. Project layout

```
AgentFlow/
├── docs/
│   ├── architecture.md         five-layer architecture, data flows
│   ├── agent-adapter.md        AgentAdapter interface contract
│   └── event-schema.md         JSONL envelope spec
├── packages/
│   ├── core/                   shared types + Scanner / Ingester / GraphBuilder / AdapterRegistry
│   ├── adapters/
│   │   └── claude-code/        ClaudeCodeAdapter + relation inference + hook forwarder source
│   ├── server/                 Express + Prisma + WebSocket + instrumentation service
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       └── migrations/20260414000000_init/migration.sql
│   └── web/                    Vue 3 dashboard (3 views, Pinia stores, G6 graph)
├── docker/
│   ├── docker-compose.yml      postgres / server / web services
│   ├── Dockerfile.server
│   ├── Dockerfile.web
│   └── nginx.conf              reverse proxies /api and /ws
├── scripts/
│   └── compose.sh              docker / podman wrapper
├── package.json                workspace root with `pnpm dev`, `pnpm compose:*`, `pnpm db:*`
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md                   ← you are here
```

---

## 6. API reference

| Method | Path | Notes |
|---|---|---|
| GET    | `/health`                                      | Liveness probe |
| GET    | `/api/projects`                                | List projects |
| POST   | `/api/projects`                                | Create — body: `{ rootPath, name? }` |
| POST   | `/api/projects/:id/scan`                       | Re-scan and return graph |
| GET    | `/api/projects/:id/instrumentation-plan`       | Preview the InstrumentationPlan |
| POST   | `/api/projects/:id/instrument`                 | Apply the plan (writes files) |
| GET    | `/api/resources?projectId=`                    | List resources |
| GET    | `/api/resources/:id`                           | Resource detail |
| GET    | `/api/events?projectId=&sessionId=&limit=`     | Recent events (default 200) |
| GET    | `/api/events/sessions?projectId=`              | Sessions summary |
| GET    | `/api/graph?projectId=`                        | Nodes + edges |
| WS     | `/ws/events`                                   | Live event stream |

---

## 7. Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| `pnpm install` complains about peer deps | Wrong Node version | Use Node 20 (`nvm use 20`) |
| `prisma migrate` hangs | Postgres not running | `pnpm compose:up` first |
| `ECONNREFUSED 5432` | DATABASE_URL points at the wrong host | In Docker the host is `postgres`, locally it's `localhost` |
| Dashboard empty after Add Project | Adapter didn't detect | Make sure the path actually contains `.claude/` |
| Timeline always empty | Hook forwarder writing to a different dir | Check `AGENTFLOW_EVENTS_DIR` matches on both sides |
| G6 nodes invisible | Container has zero height | The card needs `min-height` — already set, but check parent layout |
| `EADDRINUSE :4000` | Old server still running | `lsof -i :4000` then kill |

---

## 8. Roadmap (post-MVP)

- [ ] More adapters: Cursor, Cline, OpenCode, Gemini CLI
- [ ] Session replay: scrub a slider to step through events
- [ ] Zombie detection: highlight resources never triggered in N days
- [ ] Multi-project workspace
- [ ] Export graph as PNG / SVG
- [ ] Dark/light theme toggle (currently dark only)

---

## 9. Docs

- [Architecture](docs/architecture.md)
- [Agent Adapter Interface](docs/agent-adapter.md)
- [Event Schema](docs/event-schema.md)
