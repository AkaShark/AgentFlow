# 运行时事件 JSONL Schema

## 1. 为什么是 JSONL

- **追加写安全**：每行一个 JSON 对象，崩溃不丢前面的数据
- **零依赖**：hook 脚本只需 `fs.appendFileSync`，无需引入数据库 client
- **可读性**：用户可以直接 `tail -f events.jsonl` 调试
- **流式处理**：Ingester 可以按行读取，内存友好
- **可重放**：原始文件保留，可重建 Postgres 索引

## 2. 文件位置

默认路径：`~/.agentflow/events/<projectId>.jsonl`

也可通过环境变量 `AGENTFLOW_EVENTS_DIR` 覆盖。Docker 部署时会挂载到 `/data/events/`。

每个项目一个文件，按月切分（超过 100MB 时自动 rotate 为 `.jsonl.1`、`.jsonl.2`）。

## 3. 事件 Envelope

每行都是一个独立的 JSON 对象，结构如下：

```json
{
  "v": 1,
  "eventId": "evt_01HQ7K9X8M2N3P4R5S6T7U8V9W",
  "timestamp": "2026-04-14T08:23:11.482Z",
  "adapterId": "claude-code",
  "sessionId": "sess_01HQ7K8XYZABCDEF",
  "projectId": "proj_a3f2b1c8",
  "type": "tool_called",
  "resourceId": "claude-code:tool:Read",
  "parentEventId": "evt_01HQ7K9X8M2N3P4R5S6T7U8V9V",
  "durationMs": null,
  "payload": { ... },
  "meta": {
    "host": "macbook.local",
    "user": "sharker",
    "agentflowVersion": "0.1.0"
  }
}
```

### 字段定义

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `v` | number | ✅ | Schema 版本号，当前为 `1` |
| `eventId` | string | ✅ | 全局唯一 ID（推荐 ULID，便于按时间排序） |
| `timestamp` | string | ✅ | ISO 8601 UTC 时间，毫秒精度 |
| `adapterId` | string | ✅ | 产生该事件的 Adapter ID |
| `sessionId` | string | ✅ | 会话 ID，用于把同一次对话的事件聚合 |
| `projectId` | string | ✅ | AgentFlow 分配的项目 ID |
| `type` | string | ✅ | 事件类型，见下表 |
| `resourceId` | string | ⬜ | 关联的 Resource.id（如果适用） |
| `parentEventId` | string | ⬜ | 父事件 ID，用于构建调用链 |
| `durationMs` | number\|null | ⬜ | 仅 completed 类事件填写 |
| `payload` | object | ✅ | 事件具体内容，结构因 type 而异 |
| `meta` | object | ⬜ | 环境信息（host / user / 版本号） |

## 4. 事件类型

```
session_start       会话开始
session_end         会话结束
user_prompt         用户输入一条消息
agent_invoked       一个 subagent 被调用（开始）
agent_completed     subagent 完成
skill_invoked       一个 skill 被加载/触发
skill_completed     skill 执行完成
command_invoked     一个 slash command 被调用
tool_called         工具调用（开始）
tool_returned       工具返回（结束）
hook_triggered      一个 hook 被触发
error               任意阶段的错误
```

### 配对规则

带 `_invoked` / `_called` 的事件会有对应的 `_completed` / `_returned` 事件，通过 `parentEventId` 关联。Ingester 在配对时计算 `durationMs` 并填回 completed 事件。

## 5. payload 示例

### 5.1 user_prompt

```json
{
  "type": "user_prompt",
  "payload": {
    "text": "帮我重构这个函数",
    "attachments": [],
    "tokenCount": 12
  }
}
```

### 5.2 tool_called

```json
{
  "type": "tool_called",
  "resourceId": "claude-code:tool:Read",
  "payload": {
    "toolName": "Read",
    "input": {
      "file_path": "/Users/sharker/code/foo.ts"
    }
  }
}
```

### 5.3 tool_returned

```json
{
  "type": "tool_returned",
  "resourceId": "claude-code:tool:Read",
  "parentEventId": "evt_01HQ7K9X...",
  "durationMs": 23,
  "payload": {
    "toolName": "Read",
    "success": true,
    "outputSize": 4821
  }
}
```

### 5.4 agent_invoked

```json
{
  "type": "agent_invoked",
  "resourceId": "claude-code:agent:Explore",
  "payload": {
    "agentName": "Explore",
    "prompt": "Find all API endpoints in src/",
    "model": "sonnet"
  }
}
```

### 5.5 hook_triggered

```json
{
  "type": "hook_triggered",
  "resourceId": "claude-code:hook:PreToolUse:Bash",
  "payload": {
    "hookEvent": "PreToolUse",
    "matcher": "Bash",
    "toolName": "Bash",
    "command": "node ~/.agentflow/hook-forwarder.js PreToolUse",
    "exitCode": 0
  }
}
```

### 5.6 skill_invoked

```json
{
  "type": "skill_invoked",
  "resourceId": "claude-code:skill:frontend-design",
  "payload": {
    "skillName": "frontend-design",
    "trigger": "user_request",
    "args": "make it look modern"
  }
}
```

## 6. 隐私与安全

- `payload` 中可能包含用户 prompt 和文件内容，**不会上传任何外部服务**，仅落本地
- 提供 `AGENTFLOW_REDACT_PATTERNS` 环境变量，匹配的字段在写入前被 `***` 替换
- Dashboard 详情面板对超长 payload 默认折叠，需要点击展开

## 7. 版本演进策略

- `v` 字段标记 schema 版本，向后**不兼容**变更才升版本号
- 向后兼容的字段添加（新增可选字段）保持 v 不变
- Ingester 在解析时根据 `v` 路由到对应解析器：`parsers/v1.ts`、`parsers/v2.ts`
- 老版本数据永远可读，不强制迁移

## 8. Ingester 处理流程

```
events.jsonl (追加写)
      │
      ▼
chokidar.watch (监听 append)
      │
      ▼
按行读取新增内容
      │
      ▼
Adapter.parseEvent(line)
      │
      ▼
Pairing Buffer  (匹配 _invoked / _completed，计算 durationMs)
      │
      ▼
批量 INSERT 到 Postgres events 表
      │
      ▼
WebSocket broadcast → 前端 Timeline 实时更新
```

幂等保证：以 `eventId` 为唯一键 `ON CONFLICT DO NOTHING`，重复读取同一行不会产生脏数据。
