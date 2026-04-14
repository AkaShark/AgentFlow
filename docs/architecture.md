# AgentFlow 架构设计

## 1. 项目目标

AgentFlow 是一个**本地 Web Dashboard**，用于可视化 AI Agent 框架（Claude Code / Cursor / Cline 等）中的 **skills / subagents / commands / hooks** 是如何定义、串联和触发的。

受众：
- **小白**：打开 Dashboard 就能看到"我项目里有哪些资源、它们之间怎么连"
- **高手**：能看到运行时真实触发链路、调用频次、未触发的僵尸资源、性能瓶颈

核心能力分两层：
- **静态分析**：扫描项目配置目录，解析出所有资源及其依赖关系
- **运行时追踪**：通过 hook 埋点采集真实会话事件，回放触发链路

## 2. 五层架构

```
┌─────────────────────────────────────────────────────┐
│  Vue Frontend (Dashboard)                           │
│  - Flowchart View / Timeline View / Table View      │
│  - 左侧 FileTree · 中央 Canvas · 右侧 DetailDrawer   │
└─────────────────────────────────────────────────────┘
                        ▲  HTTP / WebSocket
                        │
┌─────────────────────────────────────────────────────┐
│  Node API Server (Fastify / Express)                │
│  - /api/resources    静态资源查询                    │
│  - /api/events       运行时事件查询                  │
│  - /api/graph        依赖关系图                      │
│  - /ws/events        实时事件推送                    │
└─────────────────────────────────────────────────────┘
                        ▲
                        │
┌─────────────────────────────────────────────────────┐
│  Core Services                                      │
│  - Scanner       静态扫描器（调用 Adapter）           │
│  - Ingester      监听 JSONL 文件 → 入库              │
│  - GraphBuilder  根据资源和事件生成依赖图              │
│  - AdapterRegistry  管理多个 AgentAdapter            │
└─────────────────────────────────────────────────────┘
                        ▲
                        │
┌─────────────────────────────────────────────────────┐
│  Agent Adapters  (可插拔)                            │
│  - ClaudeCodeAdapter  (MVP)                         │
│  - CursorAdapter      (未来)                         │
│  - ClineAdapter       (未来)                         │
└─────────────────────────────────────────────────────┘
                        ▲
                        │
┌─────────────────────────────────────────────────────┐
│  Data Sources                                       │
│  - 目标项目的配置目录（.claude/ 等）                  │
│  - events.jsonl      hook 埋点写入的事件日志          │
│  - PostgreSQL        结构化存储（资源 + 事件索引）    │
└─────────────────────────────────────────────────────┘
```

## 3. 数据流

### 3.1 静态分析流

```
用户选择项目目录
      │
      ▼
Scanner.scan(projectPath)
      │
      ▼
AdapterRegistry.detect(projectPath)
      │
      ▼  (识别到 .claude/ → 使用 ClaudeCodeAdapter)
      │
Adapter.discoverResources(projectPath)
      │
      ▼  (返回 Resource[])
      │
GraphBuilder.buildRelations(resources)
      │
      ▼
写入 Postgres (resources / relations 表)
      │
      ▼
前端请求 /api/graph → 渲染 Flowchart
```

### 3.2 运行时追踪流

```
用户在目标项目中使用 AI Agent
      │
      ▼
AgentFlow 注入的 hook 触发
      │
      ▼
hook 脚本将事件追加写入 events.jsonl
      │
      ▼
Ingester 监听文件变化 (chokidar)
      │
      ▼
Adapter.parseEvent(rawLine) → 标准化事件
      │
      ▼
写入 Postgres (events 表) + WebSocket 推送
      │
      ▼
前端 Timeline View 实时更新
```

## 4. 核心组件职责

| 组件 | 职责 | 不负责 |
|---|---|---|
| **Scanner** | 扫描目录、调度 Adapter | 不解析具体文件格式 |
| **AdapterRegistry** | 根据目录特征识别 Agent 框架、加载对应 Adapter | 不做业务逻辑 |
| **AgentAdapter** | 封装某个 Agent 框架的目录结构 / 文件格式 / 事件格式 | 不负责存储 |
| **Ingester** | 监听 JSONL、去重、批量入库 | 不解析事件内容（委托 Adapter） |
| **GraphBuilder** | 从资源元数据中推导依赖关系（谁能调谁） | 不渲染 |
| **API Server** | 对外提供查询接口、WebSocket 推送 | 不直接扫描文件 |

## 5. 目录结构（计划）

```
AgentFlow/
├── docs/                       # 设计文档
│   ├── architecture.md
│   ├── agent-adapter.md
│   └── event-schema.md
├── packages/
│   ├── core/                   # Scanner / Ingester / GraphBuilder
│   ├── adapters/
│   │   └── claude-code/        # ClaudeCodeAdapter (MVP)
│   ├── server/                 # Node API + WebSocket
│   └── web/                    # Vue 前端
├── docker/
│   ├── docker-compose.yml
│   ├── Dockerfile.server
│   └── Dockerfile.web
├── scripts/
│   └── install-hooks.sh        # 向目标项目注入埋点 hook
└── package.json                # pnpm workspace
```

## 6. 部署

单条命令起全栈：

```bash
docker compose up
```

Compose 包含三个服务：
- `postgres`：Postgres 16，持久化到 volume
- `server`：Node API + Ingester（挂载目标项目目录为只读卷）
- `web`：Vue 静态站点（nginx 或 vite preview）

用户访问 `http://localhost:5173` 进入 Dashboard，首次使用时在 UI 里选择目标项目路径。

## 7. 关键设计决策

| 决策 | 选型 | 理由 |
|---|---|---|
| 数据库 | PostgreSQL | JSONB 适合存 event payload；未来扩多项目无需迁移 |
| 事件落盘 | JSONL 文件 | 无依赖、崩溃不丢数据、用户可直接查看原始数据 |
| 静态 + 运行时混合 | 两条独立管道 | 静态可离线分析，运行时可渐进增量 |
| Adapter 抽象 | 四方法接口 | 新增框架只需实现 Adapter，核心零改动 |
| 前端通信 | HTTP + WebSocket | 查询用 REST，实时事件用 WS |

## 8. MVP 范围

**MVP 只实现 Claude Code 适配器**，但所有核心代码必须通过 `AgentAdapter` 接口调用，不得直接耦合 `.claude/` 路径。验收标准：
- [ ] 能扫描一个真实 Claude Code 项目并渲染 Flowchart
- [ ] 能通过注入的 hook 采集 PreToolUse / PostToolUse / UserPromptSubmit 事件
- [ ] Timeline View 实时显示事件，点击可查看详情
- [ ] Table View 列出所有资源 + 触发次数 + 最后触发时间
- [ ] `docker compose up` 一键启动
