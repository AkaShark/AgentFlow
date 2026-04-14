# AgentAdapter 接口设计

## 1. 为什么需要 Adapter

不同 AI Agent 框架的目录结构、文件格式、事件协议都不一样：

| 框架 | Skills 路径 | Agents 路径 | Hooks 配置 | 事件协议 |
|---|---|---|---|---|
| Claude Code | `.claude/skills/` | `.claude/agents/` | `settings.json` 里的 hooks 字段 | hook 脚本 stdin JSON |
| Cursor | `.cursor/rules/` | — | `.cursor/hooks/`（社区方案） | 自定义 |
| Cline | `.clinerules/` | — | — | — |
| OpenCode | `opencode.json` | — | — | — |

如果核心代码直接耦合 `.claude/`，每加一个框架都要改 Scanner / Ingester / GraphBuilder。Adapter 抽象的目的是让**核心零改动**就能扩展新框架。

## 2. 核心接口

```typescript
// packages/core/src/types/adapter.ts

export interface AgentAdapter {
  /** 框架唯一标识，例如 "claude-code" */
  readonly id: string;

  /** 用于 UI 显示，例如 "Claude Code" */
  readonly displayName: string;

  /**
   * 检测目标项目是否可被该 Adapter 处理
   * 通常通过判断特征文件/目录是否存在
   * @returns 0-1 的置信度，>0.5 视为命中
   */
  detect(projectPath: string): Promise<number>;

  /**
   * 扫描目标项目，发现所有资源（skills / agents / commands / hooks）
   * 这是静态分析的入口
   */
  discoverResources(projectPath: string): Promise<Resource[]>;

  /**
   * 解析单个资源文件，返回结构化元数据
   * Scanner 会缓存结果，文件变更时增量调用
   */
  parseResource(filePath: string): Promise<Resource>;

  /**
   * 返回向目标项目注入埋点 hook 的方案
   * AgentFlow 用它来生成"安装运行时追踪"的脚本/指引
   */
  getInstrumentationSetup(projectPath: string): InstrumentationPlan;

  /**
   * 把 JSONL 中一行原始事件标准化为统一 schema
   * Ingester 会逐行调用
   */
  parseEvent(rawLine: string): AgentEvent | null;
}
```

## 3. 数据类型

### 3.1 Resource

```typescript
export type ResourceType = 'skill' | 'agent' | 'command' | 'hook';

export interface Resource {
  /** 全局唯一 ID，建议格式：{adapterId}:{type}:{name} */
  id: string;

  type: ResourceType;

  /** 资源名（例如 skill 名、agent 名、command 名） */
  name: string;

  /** 文件绝对路径 */
  filePath: string;

  /** 一句话描述（通常来自 frontmatter description） */
  description?: string;

  /** 解析出的 frontmatter / 配置原文 */
  metadata: Record<string, unknown>;

  /** 该资源声明的依赖：它可能调用谁、被谁触发 */
  relations: ResourceRelation[];

  /** 原始内容（用于详情面板展示，可截断） */
  rawContent?: string;
}

export interface ResourceRelation {
  /** 关系类型：calls=主动调用，triggeredBy=被触发，references=引用 */
  kind: 'calls' | 'triggeredBy' | 'references';

  /** 目标资源 ID（如果还没解析到，可以是 name） */
  targetId: string;

  /** 关系强度：static=静态可见，inferred=推断的 */
  confidence: 'static' | 'inferred';
}
```

### 3.2 InstrumentationPlan

```typescript
export interface InstrumentationPlan {
  /** 需要写入目标项目的文件 */
  files: Array<{
    path: string;        // 相对于项目根
    content: string;     // 文件内容
    mode?: number;       // 可执行脚本设 0o755
  }>;

  /** 需要修改的现有文件（例如往 settings.json 里加 hooks 字段） */
  patches: Array<{
    path: string;
    operation: 'merge-json' | 'append';
    payload: unknown;
  }>;

  /** 给用户看的安装说明 */
  instructions: string;
}
```

### 3.3 AgentEvent

详见 `event-schema.md`，这里仅给出 TS 类型：

```typescript
export interface AgentEvent {
  eventId: string;
  timestamp: string;        // ISO 8601
  adapterId: string;
  sessionId: string;
  type: AgentEventType;
  resourceId?: string;      // 关联的 Resource.id
  parentEventId?: string;   // 调用链父节点
  durationMs?: number;
  payload: Record<string, unknown>;
}

export type AgentEventType =
  | 'session_start'
  | 'session_end'
  | 'user_prompt'
  | 'agent_invoked'
  | 'agent_completed'
  | 'skill_invoked'
  | 'skill_completed'
  | 'command_invoked'
  | 'tool_called'
  | 'tool_returned'
  | 'hook_triggered'
  | 'error';
```

## 4. Claude Code 参考实现

### 4.1 detect

```typescript
async detect(projectPath: string): Promise<number> {
  const claudeDir = path.join(projectPath, '.claude');
  if (await pathExists(claudeDir)) return 1.0;

  const settingsPath = path.join(projectPath, '.claude', 'settings.json');
  if (await pathExists(settingsPath)) return 1.0;

  return 0;
}
```

### 4.2 discoverResources

扫描以下路径：

| 路径 | 类型 | 解析方式 |
|---|---|---|
| `.claude/skills/**/SKILL.md` | skill | YAML frontmatter（name / description / triggers） |
| `.claude/agents/*.md` | agent | YAML frontmatter（name / description / tools / model） |
| `.claude/commands/*.md` | command | YAML frontmatter（description / argument-hint） |
| `.claude/settings.json` 中 `hooks` 字段 | hook | 解析 JSON，每个 matcher 生成一个 Resource |
| 用户级 `~/.claude/{skills,agents,commands}` | * | 同上，标记 `metadata.scope = 'user'` |

### 4.3 关系推导

- **agent → skill**：扫描 agent 文件正文，匹配已知 skill 名
- **command → agent**：扫描 command 文件，匹配 `Agent(subagent_type=...)` 调用
- **hook → tool**：解析 hook 配置中的 `matcher` 字段，关联到对应的工具名

第一版可以先做静态文件名匹配，后续再升级为 AST/语义匹配。

### 4.4 getInstrumentationSetup

往目标项目 `.claude/settings.json` 注入 hook 配置，把所有 PreToolUse / PostToolUse / UserPromptSubmit 事件转发到一个本地脚本：

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": ".*",
      "hooks": [{
        "type": "command",
        "command": "node ~/.agentflow/hook-forwarder.js PreToolUse"
      }]
    }]
  }
}
```

`hook-forwarder.js` 读 stdin 的 hook payload，加上 sessionId / timestamp 后追加写入 `~/.agentflow/events.jsonl`。

### 4.5 parseEvent

把 hook payload 映射到 `AgentEvent`：

```typescript
parseEvent(rawLine: string): AgentEvent | null {
  const raw = JSON.parse(rawLine);
  return {
    eventId: raw.id ?? uuid(),
    timestamp: raw.timestamp,
    adapterId: 'claude-code',
    sessionId: raw.session_id,
    type: mapHookEventType(raw.hook_event_name),
    resourceId: raw.tool_name ? `claude-code:tool:${raw.tool_name}` : undefined,
    payload: raw,
  };
}
```

## 5. 添加新 Adapter 的清单

实现一个新的 Adapter 大致需要：

1. 在 `packages/adapters/<framework>/` 新建包
2. 实现 `AgentAdapter` 接口
3. 在 `AdapterRegistry.register()` 中注册
4. 写一个最小化的 fixture 项目放到 `packages/adapters/<framework>/fixtures/`
5. 跑 adapter 通用测试套件（`packages/core/src/test/adapter-suite.ts`）

通用测试套件会针对 fixture 验证：
- detect 返回 1.0
- discoverResources 至少能找到 1 个资源
- parseResource 对每个文件返回有效 metadata
- parseEvent 对样例 JSONL 行能正确标准化

只要测试通过，新 Adapter 就能被 Dashboard 识别和展示。
