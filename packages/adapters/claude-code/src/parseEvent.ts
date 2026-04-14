import { ulid } from 'ulid';
import type { AgentEvent, AgentEventType } from '@agentflow/core';

interface RawClaudeHookEvent {
  hook_event_name?: string;
  session_id?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  prompt?: string;
  timestamp?: string;
  // AgentFlow-injected fields
  af_project_id?: string;
  af_event_id?: string;
  af_parent_event_id?: string;
}

export function parseClaudeEvent(rawLine: string): AgentEvent | null {
  let data: RawClaudeHookEvent;
  try {
    data = JSON.parse(rawLine);
  } catch {
    return null;
  }

  if (!data.hook_event_name) return null;

  return {
    v: 1,
    eventId: data.af_event_id ?? ulid(),
    timestamp: data.timestamp ?? new Date().toISOString(),
    adapterId: 'claude-code',
    sessionId: data.session_id ?? 'unknown',
    projectId: data.af_project_id ?? 'unknown',
    type: mapHookEventType(data.hook_event_name),
    resourceId: data.tool_name ? `claude-code:tool:${data.tool_name}` : undefined,
    parentEventId: data.af_parent_event_id,
    payload: data as Record<string, unknown>,
  };
}

function mapHookEventType(hookName: string): AgentEventType {
  switch (hookName) {
    case 'PreToolUse':
      return 'tool_called';
    case 'PostToolUse':
      return 'tool_returned';
    case 'UserPromptSubmit':
      return 'user_prompt';
    case 'SessionStart':
      return 'session_start';
    case 'SessionEnd':
      return 'session_end';
    default:
      return 'hook_triggered';
  }
}
