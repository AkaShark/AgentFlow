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

export interface AgentEvent {
  v: number;
  eventId: string;
  timestamp: string;
  adapterId: string;
  sessionId: string;
  projectId: string;
  type: AgentEventType;
  resourceId?: string;
  parentEventId?: string;
  durationMs?: number | null;
  payload: Record<string, unknown>;
  meta?: Record<string, unknown>;
}
