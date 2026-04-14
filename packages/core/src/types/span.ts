export type SpanType =
  | 'session'
  | 'user_prompt'
  | 'tool'
  | 'agent'
  | 'skill'
  | 'command'
  | 'hook'
  | 'other';

export interface CallSpan {
  /** Stable ID — equals the opening event's eventId, except for the synthetic session root. */
  id: string;
  parentId: string | null;
  sessionId: string;
  projectId: string;
  type: SpanType;
  name: string;
  resourceId?: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  /** Duration spent in this span itself, excluding time delegated to children. */
  selfTimeMs: number | null;
  depth: number;
  /** True if the span was opened but never closed (e.g. session crashed mid-way). */
  open: boolean;
  children: CallSpan[];
  payload?: Record<string, unknown>;
}

export interface SessionTrace {
  sessionId: string;
  projectId: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  eventCount: number;
  root: CallSpan;
}
