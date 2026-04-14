import type { CallSpan, SessionTrace, SpanType } from '@agentflow/core';

export interface RawEventRow {
  id: string;
  sessionId: string;
  projectId: string;
  type: string;
  resourceId: string | null;
  timestamp: Date;
  durationMs: number | null;
  payload: unknown;
}

const OPEN_EVENT_TYPES = new Set([
  'session_start',
  'user_prompt',
  'tool_called',
  'agent_invoked',
  'skill_invoked',
  'command_invoked',
]);

const CLOSE_FOR_OPEN: Record<string, string> = {
  session_end: 'session_start',
  tool_returned: 'tool_called',
  agent_completed: 'agent_invoked',
  skill_completed: 'skill_invoked',
};

function spanTypeFromEvent(eventType: string): SpanType {
  if (eventType.startsWith('session')) return 'session';
  if (eventType === 'user_prompt') return 'user_prompt';
  if (eventType.startsWith('tool')) return 'tool';
  if (eventType.startsWith('agent')) return 'agent';
  if (eventType.startsWith('skill')) return 'skill';
  if (eventType.startsWith('command')) return 'command';
  if (eventType.startsWith('hook')) return 'hook';
  return 'other';
}

function openEventTypeForSpan(spanType: SpanType): string {
  switch (spanType) {
    case 'session': return 'session_start';
    case 'tool': return 'tool_called';
    case 'agent': return 'agent_invoked';
    case 'skill': return 'skill_invoked';
    case 'command': return 'command_invoked';
    default: return '';
  }
}

function spanName(event: RawEventRow): string {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  const pick = (keys: string[]): string | null => {
    for (const k of keys) {
      const v = p[k];
      if (typeof v === 'string' && v.length > 0) return v;
    }
    return null;
  };
  if (event.type.startsWith('tool')) return pick(['tool_name', 'toolName']) ?? 'tool';
  if (event.type.startsWith('agent')) return pick(['agentName', 'agent_name', 'name']) ?? 'agent';
  if (event.type.startsWith('skill')) return pick(['skillName', 'skill_name', 'name']) ?? 'skill';
  if (event.type.startsWith('command')) return pick(['commandName', 'command_name', 'name']) ?? 'command';
  if (event.type === 'user_prompt') {
    const text = pick(['prompt', 'text']) ?? '';
    return text.length > 80 ? text.slice(0, 80) + '…' : text || 'user prompt';
  }
  if (event.type === 'session_start') return 'Session';
  return event.type;
}

export function buildSessionTraces(events: RawEventRow[]): SessionTrace[] {
  const bySession = new Map<string, RawEventRow[]>();
  for (const e of events) {
    const arr = bySession.get(e.sessionId) ?? [];
    arr.push(e);
    bySession.set(e.sessionId, arr);
  }

  const traces: SessionTrace[] = [];
  for (const [sessionId, list] of bySession) {
    list.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    traces.push(buildOneTrace(sessionId, list));
  }
  traces.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  return traces;
}

function buildOneTrace(sessionId: string, events: RawEventRow[]): SessionTrace {
  const projectId = events[0]?.projectId ?? '';
  const first = events[0]?.timestamp ?? new Date();
  const last = events[events.length - 1]?.timestamp ?? first;

  const root: CallSpan = {
    id: `root:${sessionId}`,
    parentId: null,
    sessionId,
    projectId,
    type: 'session',
    name: `Session ${sessionId.slice(0, 12)}`,
    startTime: first.toISOString(),
    endTime: last.toISOString(),
    durationMs: last.getTime() - first.getTime(),
    selfTimeMs: null,
    depth: 0,
    open: false,
    children: [],
  };

  const stack: CallSpan[] = [root];
  const byToolUseId = new Map<string, CallSpan>();

  for (const event of events) {
    const closedType = CLOSE_FOR_OPEN[event.type];
    if (closedType) {
      closeMatchingSpan(stack, event, closedType, byToolUseId);
      continue;
    }

    if (!OPEN_EVENT_TYPES.has(event.type)) continue;
    if (event.type === 'session_start') continue; // represented by root

    const parent = stack[stack.length - 1] ?? root;
    const span: CallSpan = {
      id: event.id,
      parentId: parent.id,
      sessionId,
      projectId: event.projectId,
      type: spanTypeFromEvent(event.type),
      name: spanName(event),
      resourceId: event.resourceId ?? undefined,
      startTime: event.timestamp.toISOString(),
      endTime: null,
      durationMs: null,
      selfTimeMs: null,
      depth: parent.depth + 1,
      open: true,
      children: [],
      payload: (event.payload ?? {}) as Record<string, unknown>,
    };
    parent.children.push(span);

    // user_prompt is instantaneous — close immediately
    if (event.type === 'user_prompt') {
      span.endTime = span.startTime;
      span.durationMs = 0;
      span.open = false;
      continue;
    }

    // Track tool_use_id for precise pairing with the matching close event
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const toolUseId = typeof payload.tool_use_id === 'string' ? payload.tool_use_id : null;
    if (toolUseId) byToolUseId.set(toolUseId, span);

    stack.push(span);
  }

  // Compute self-time bottom-up
  computeSelfTime(root);

  return {
    sessionId,
    projectId,
    startTime: root.startTime,
    endTime: root.endTime ?? root.startTime,
    durationMs: root.durationMs ?? 0,
    eventCount: events.length,
    root,
  };
}

function computeSelfTime(span: CallSpan): void {
  let childSum = 0;
  for (const c of span.children) {
    computeSelfTime(c);
    if (c.durationMs != null) childSum += c.durationMs;
  }
  if (span.durationMs != null) {
    span.selfTimeMs = Math.max(0, span.durationMs - childSum);
  }
}

function closeMatchingSpan(
  stack: CallSpan[],
  event: RawEventRow,
  expectedOpenType: string,
  byToolUseId: Map<string, CallSpan>,
): void {
  // Prefer exact match by tool_use_id if payload has one
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const toolUseId = typeof payload.tool_use_id === 'string' ? payload.tool_use_id : null;
  if (toolUseId && byToolUseId.has(toolUseId)) {
    const target = byToolUseId.get(toolUseId)!;
    closeSpan(target, event);
    byToolUseId.delete(toolUseId);
    // Also pop anything above it in the stack (orphaned opens)
    const idx = stack.indexOf(target);
    if (idx >= 0) stack.splice(idx);
    return;
  }

  // Fallback: walk stack from the top, find first span whose open event type matches
  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i]!;
    if (openEventTypeForSpan(s.type) === expectedOpenType) {
      closeSpan(s, event);
      stack.splice(i);
      return;
    }
  }
  // No match — ignored (orphan close)
}

function closeSpan(span: CallSpan, event: RawEventRow): void {
  span.endTime = event.timestamp.toISOString();
  span.durationMs = new Date(span.endTime).getTime() - new Date(span.startTime).getTime();
  span.open = false;
}
