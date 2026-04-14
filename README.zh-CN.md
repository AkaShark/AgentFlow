# AgentFlow

> 一个本地 Web Dashboard，用于可视化 AI Agent 的 **skills**、**subagents**、**commands** 和 **hooks** 是怎么串起来、什么时候被触发的。

[English](./README.md) · 中文

AgentFlow 把任意一个使用 AI 编码助手（首先支持 Claude Code，后续会扩展）的项目作为分析对象，给你三种视图：

- 📐 **Static Flowchart** — 力导向图，把所有 skill / agent / command / hook 和它们的关系画出来
- ⏱ **Runtime Timeline** — 通过注入的 hook 采集真实运行事件，按时间轴回放
- 📋 **Resource Table** — 资源清单 + 触发次数，可排序

## 技术栈

| 层级 | 技术 |
|---|---|
| Monorepo  | pnpm workspaces |
| 后端      | Node 20 · Express · TypeScript · Prisma · PostgreSQL 15 |
| 前端      | Vue 3 · Vite · TypeScript · Pinia · Naive UI · AntV G6 v5 |
| 运行时    | Hook 注入 JSONL → 文件监听 → Postgres → WebSocket |
| 容器      | Docker Compose（通过 wrapper 兼容 Podman） |

---

## 1. 前置依赖

- **Node.js ≥ 20** — `nvm install 20 && nvm use`
- **pnpm ≥ 9** — `npm i -g pnpm` 或 `corepack enable`
- **容器引擎**：Docker Desktop / OrbStack **或** Podman 4.4+
- 一个真实的 **Claude Code 项目** 用来分析（包含 `.claude/` 目录就行）

检查版本：

```bash
node -v        # v20.x
pnpm -v        # 9.x
docker --version || podman --version
```

---

## 2. 首次配置

```bash
# 1. 安装所有 workspace 依赖
pnpm install

# 2. 启动 postgres（自动检测 docker 或 podman）
pnpm compose:up

# 3. 配置 server 环境变量
cp packages/server/.env.example packages/server/.env

# 4. 应用数据库 migration
pnpm db:migrate
```

`pnpm db:migrate` 这一步会：
- 对容器里的 Postgres 跑 `prisma migrate deploy`
- 生成 Prisma 客户端
- 初始 migration 在 `packages/server/prisma/migrations/20260414000000_init/`

如果你改了 `schema.prisma`，用下面命令生成新 migration：

```bash
cd packages/server
pnpm exec prisma migrate dev --name describe_your_change
```

---

## 3. 日常开发

### 一键启动

```bash
pnpm dev
```

它会跑 `pnpm -r --parallel run dev`，并行启动：

| 进程 | 端口 | 作用 |
|---|---|---|
| `@agentflow/server` (tsx watch)         | `4000` | Express API + WebSocket + JSONL ingester |
| `@agentflow/web` (vite)                 | `5173` | Vue dashboard，支持 HMR |
| `@agentflow/core` (tsc -w)              | —      | 共享类型 watch 模式 |
| `@agentflow/adapter-claude-code` (tsc -w) | —    | 同上 |

打开 <http://localhost:5173>。

### 添加并扫描一个项目

1. 打开 **Projects** 页面（默认登陆页就是它）
2. 点 **+ Add Project**
3. 粘贴一个 Claude Code 项目的绝对路径（必须包含 `.claude/` 或 `CLAUDE.md`）
4. 可选：默认勾选的 **Install hook instrumentation now** 会顺手把 hook 装好
5. 点 **Add & scan** —— AgentFlow 会跑 adapter 探测 → 静态扫描 → 可选地装 hook → 自动选中这个项目
6. 切到 **Flowchart** tab → 点任意节点 → DetailDrawer 滑出，显示完整元数据

### 采集运行时事件

装 hook 转发器有**两种方式**：

#### 方式 A —— 添加项目时自动装（默认推荐）

Add Project 弹窗里有 **Install hook instrumentation now** 的勾选框（默认勾上）。勾上的话 AgentFlow 会：
- 创建项目记录
- 跑静态扫描
- 立即应用 instrumentation plan

之后你只需要 **重启那个项目目录里的 Claude Code 会话**，事件就开始流入。

#### 方式 B —— Dashboard 里手动装

如果你想先看清楚要写什么再决定（或者方式 A 那个勾选框被你取消了）：

1. 选中项目，点 header 的 **Install Hooks** 按钮
2. 弹窗会显示要写的每个文件和每个 JSON patch
3. 看清楚后点 **Apply**
4. 重启你的 Claude Code 会话

#### 会写什么

两种方式都只写下面两样东西到你的项目根目录：

- **`<project>/.agentflow/hook-forwarder.mjs`** —— 一个 ~80 行的 Node.js 脚本，里面**烤进了**这个项目对应的 AgentFlow `projectId`。它从 stdin 读 hook event payload，append 一行到 `~/.agentflow/events/<projectId>.jsonl`。
- **Patch `<project>/.claude/settings.json`** —— 往 `hooks` 字段里加 `PreToolUse`、`PostToolUse`、`UserPromptSubmit`、`SessionStart`、`SessionEnd` 五个条目。**已有的 hook 会保留**（deep merge，不是覆盖）。

除了你的项目根目录和 `~/.agentflow/` 之外，**任何地方都不会被改动**。没有全局状态、没有环境变量配置、没有后台守护进程。

#### 采集机制究竟是怎么工作的

AgentFlow **完全没有"注入"** 到 Claude Code 进程里——它利用的是 Claude Code 自带的 hook 机制：

```
Claude Code 会话
      │（你让 Claude 做点什么）
      ▼
Claude 调用一个工具（Read / Bash / Edit / …）
      │
      │ 命中 settings.json 里的 PreToolUse hook
      ▼
Claude Code spawn 一个子进程：node .agentflow/hook-forwarder.mjs PreToolUse
      │
      │ stdin: {"tool_name":"Read","tool_input":{...},"session_id":"..."}
      ▼
forwarder append 一行 JSONL，~3ms 退出
      │
      ▼
~/.agentflow/events/<projectId>.jsonl
      │
      │ chokidar 文件监听
      ▼
AgentFlow Ingester → adapter.parseEvent() → Postgres
      │
      ├─→ /api/events 给 Timeline 视图
      └─→ WebSocket /ws/events 给前端实时
```

#### 重要：hook 是会话启动时加载的

Claude Code **只在会话启动时读一次** `.claude/settings.json`。装完 hook 后，**当前正在跑的那个会话不会捕获事件**——它的 hook 表早就锁定了。你需要：

- 退出并重启那个项目里的 Claude Code，**或者**
- 开一个新的 terminal 启动一个新会话——两个会话可以并行跑，只有新会话会捕获事件

#### 卸载

目前**没有 Uninstall Hooks 按钮**。想手动移除：

```bash
cd /path/to/your/project
git checkout .claude/settings.json     # 如果有版本管理
# 或手动编辑删掉 AgentFlow 加的部分
rm -rf .agentflow/
```

AgentFlow 只会改 `.claude/settings.json` 和 `.agentflow/` 这两处，所以清理范围很局部。

#### 未来的安装方式（路线图）

| 方式 | 状态 | 适合谁 |
|---|---|---|
| Dashboard 自动安装（Add Project 勾选） | ✅ 已实现 | 大部分用户 |
| Dashboard 手动安装（Install Hooks 按钮 + 预览） | ✅ 已实现 | 谨慎用户 / 重装场景 |
| `npx agentflow init` CLI | 🔜 v0.2 | 不想开 dashboard、习惯命令行的用户 |
| Claude Code plugin (`claude plugins install agentflow`) | 🔜 v1+ | 零配置，原生集成 Claude 生态 |

### 容器引擎兼容

`pnpm compose:*` 会按 `docker compose` → `podman compose` → `podman-compose` 顺序自动探测。强制指定：

```bash
AGENTFLOW_ENGINE=podman pnpm compose:up
```

---

## 4. 调试

### 4.1 后端 (`@agentflow/server`)

```bash
# 看日志
pnpm --filter @agentflow/server dev   # tsx watch，带堆栈

# 只跑类型检查
pnpm --filter @agentflow/server typecheck

# 调用接口
curl http://localhost:4000/health
curl http://localhost:4000/api/projects
curl "http://localhost:4000/api/resources?projectId=<id>"
curl "http://localhost:4000/api/graph?projectId=<id>"
```

挂 Node 调试器：把 `packages/server/package.json` 的 dev 脚本改成：

```json
"dev": "tsx watch --inspect=9229 src/index.ts"
```

然后用 VS Code 或 Chrome DevTools 连 `localhost:9229`。

### 4.2 数据库

```bash
# 进入容器内的 psql
docker exec -it agentflow-postgres psql -U agentflow -d agentflow
# 或
podman exec -it agentflow-postgres psql -U agentflow -d agentflow

# Prisma Studio（可视化表管理）
cd packages/server && pnpm exec prisma studio
```

常用查询：

```sql
SELECT id, name, "rootPath", "adapterId" FROM "Project";
SELECT type, count(*) FROM "Resource" GROUP BY type;
SELECT type, count(*) FROM "Event"  GROUP BY type ORDER BY 2 DESC;
SELECT "sessionId", count(*) FROM "Event" GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
```

清空一切重来：

```bash
pnpm compose:down
docker volume rm agentflow_agentflow-pgdata    # 或 podman volume rm ...
pnpm compose:up
pnpm db:migrate
```

### 4.3 前端 (`@agentflow/web`)

- Vite HMR 默认开启，保存即更新
- Vue DevTools（浏览器扩展）可以实时看 Pinia store：`project`、`selection`
- Network 面板能看到通过 Vite proxy 转发的请求（`/api` → `:4000`，`/ws` → ws on `:4000`）
- 单独跑类型检查：

  ```bash
  pnpm --filter @agentflow/web typecheck
  ```

常见坑：

- **CORS 报错**：要确保 Vite proxy 在跑。如果直接调 API，服务端用 `cors()` 允许所有 origin。
- **WebSocket 断开**：看服务端日志，通常是 Ingester 抛错导致的。
- **Naive UI 深色主题没生效**：检查 `App.vue` 里有没有 `<NConfigProvider :theme="darkTheme">` 包裹整个应用。

### 4.4 Hook 埋点

最难调的一块，因为它跑在目标 Claude Code 会话进程里。

**手动测试转发器**：

```bash
echo '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' \
  | AGENTFLOW_PROJECT_ID=test node <project>/.agentflow/hook-forwarder.mjs PreToolUse

# 然后看文件：
cat ~/.agentflow/events/test.jsonl
```

如果有行写进去就说明转发器没问题。如果 Dashboard 还是空的，依次检查：

1. **Ingester** 监听的目录对不对：
   - 服务端日志里有这一行：`[agentflow] watching events at /...`
   - 用 `packages/server/.env` 的 `AGENTFLOW_EVENTS_DIR=/abs/path` 覆盖
2. JSONL 里的 `projectId` 跟 Postgres 里 `Project.id` 是否匹配
3. Adapter 的 `parseEvent` 是否对那一行返回了非 null：

   ```bash
   pnpm --filter @agentflow/adapter-claude-code exec node -e \
     'import("./dist/parseEvent.js").then(m => console.log(m.parseClaudeEvent("LINE_HERE")))'
   ```

**实时观察事件**：

```bash
tail -f ~/.agentflow/events/<projectId>.jsonl | jq .
```

**卸载 hook**：编辑你项目的 `.claude/settings.json` 删掉 `hooks` 块，或者 `git checkout`。AgentFlow 不会自动还原。

### 4.5 Adapter 修改

在 `packages/adapters/claude-code/` 迭代：

```bash
pnpm --filter @agentflow/adapter-claude-code dev   # tsc --watch
```

服务端通过 `workspace:*` 引用它，所以 import 变化时 `tsx watch` 会自动重启。

Adapter 改完后重新扫描：

```bash
curl -X POST http://localhost:4000/api/projects/<id>/scan
```

---

## 5. 项目结构

```
AgentFlow/
├── docs/
│   ├── architecture.md         五层架构、数据流
│   ├── agent-adapter.md        AgentAdapter 接口契约
│   └── event-schema.md         JSONL envelope 规范
├── packages/
│   ├── core/                   共享类型 + Scanner / Ingester / GraphBuilder / AdapterRegistry
│   ├── adapters/
│   │   └── claude-code/        ClaudeCodeAdapter + 关系推导 + hook 转发器源码
│   ├── server/                 Express + Prisma + WebSocket + 埋点服务
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       └── migrations/20260414000000_init/migration.sql
│   └── web/                    Vue 3 dashboard（3 视图、Pinia store、G6 图）
├── docker/
│   ├── docker-compose.yml      postgres / server / web 服务
│   ├── Dockerfile.server
│   ├── Dockerfile.web
│   └── nginx.conf              反向代理 /api 和 /ws
├── scripts/
│   └── compose.sh              docker / podman 探测脚本
├── package.json                workspace 根，含 `pnpm dev`、`pnpm compose:*`、`pnpm db:*`
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md / README.zh-CN.md
```

---

## 6. API 参考

| Method | 路径 | 说明 |
|---|---|---|
| GET    | `/health`                                      | 健康检查 |
| GET    | `/api/projects`                                | 项目列表 |
| POST   | `/api/projects`                                | 创建项目，body：`{ rootPath, name? }` |
| POST   | `/api/projects/:id/scan`                       | 重新扫描，返回 graph |
| GET    | `/api/projects/:id/instrumentation-plan`       | 预览 InstrumentationPlan |
| POST   | `/api/projects/:id/instrument`                 | 应用 plan（写文件） |
| GET    | `/api/resources?projectId=`                    | 资源列表 |
| GET    | `/api/resources/:id`                           | 资源详情 |
| GET    | `/api/events?projectId=&sessionId=&limit=`     | 最近事件（默认 200 条） |
| GET    | `/api/events/sessions?projectId=`              | 会话汇总 |
| GET    | `/api/graph?projectId=`                        | 节点 + 边 |
| WS     | `/ws/events`                                   | 实时事件流 |

---

## 7. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| `pnpm install` 抱怨 peer deps | Node 版本不对 | 用 Node 20（`nvm use 20`） |
| `prisma migrate` 卡住 | Postgres 没起 | 先 `pnpm compose:up` |
| `ECONNREFUSED 5432` | DATABASE_URL host 错了 | Docker 里是 `postgres`，本地是 `localhost` |
| Add Project 后 dashboard 空 | Adapter 没识别到 | 检查路径里确实有 `.claude/` |
| Timeline 一直空 | 转发器写到了别的目录 | 确认两边的 `AGENTFLOW_EVENTS_DIR` 一致 |
| G6 节点看不见 | 容器高度为 0 | 已经设了 `min-height`，检查父布局 |
| `EADDRINUSE :4000` | 旧服务还在 | `lsof -i :4000` 找出来 kill |

---

## 8. 路线图（MVP 之后）

- [ ] 更多 adapter：Cursor、Cline、OpenCode、Gemini CLI
- [ ] Session replay：拉时间轴 slider 逐步回放
- [ ] 僵尸资源检测：高亮 N 天内未触发的资源
- [ ] 多项目工作区
- [ ] 图谱导出 PNG / SVG
- [ ] 浅色 / 深色主题切换（目前只有深色）

---

## 9. 文档

- [架构设计](docs/architecture.md)
- [Agent Adapter 接口](docs/agent-adapter.md)
- [事件 Schema](docs/event-schema.md)
