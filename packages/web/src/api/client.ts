import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  adapterId: string;
  createdAt?: string;
  updatedAt?: string;
  _count?: { resources: number; events: number };
}

export interface ResourceDTO {
  id: string;
  type: 'skill' | 'agent' | 'command' | 'hook' | 'tool';
  name: string;
  filePath: string;
  description?: string;
  metadata: Record<string, unknown> & {
    scope?: 'project' | 'user' | 'plugin' | 'builtin';
    plugin?: string;
  };
  _count?: { events: number };
}

export interface GraphNodeDTO {
  id: string;
  label: string;
  type: 'skill' | 'agent' | 'command' | 'hook' | 'tool';
  description?: string;
  scope?: 'project' | 'user' | 'plugin' | 'builtin';
  plugin?: string;
}

export interface GraphEdgeDTO {
  source: string;
  target: string;
  kind: 'calls' | 'triggeredBy' | 'references';
  confidence: 'static' | 'inferred';
}

export interface GraphDTO {
  nodes: GraphNodeDTO[];
  edges: GraphEdgeDTO[];
}

export interface EventDTO {
  id: string;
  projectId: string;
  sessionId: string;
  type: string;
  resourceId?: string;
  parentEventId?: string;
  timestamp: string;
  durationMs?: number;
  payload: Record<string, unknown>;
}

export interface InstrumentationPlanDTO {
  files: Array<{ path: string; content: string; mode?: number }>;
  patches: Array<{ path: string; operation: 'merge-json' | 'append'; payload: unknown }>;
  instructions: string;
}

export interface InstrumentationApplyResult {
  ok: boolean;
  written: string[];
  patched: string[];
  instructions: string;
}

export const ProjectsApi = {
  list: () => api.get<Project[]>('/projects').then((r) => r.data),
  create: (rootPath: string, name?: string) =>
    api.post<Project>('/projects', { rootPath, name }).then((r) => r.data),
  remove: (id: string) =>
    api.delete<{ ok: true }>(`/projects/${id}`).then((r) => r.data),
  scan: (id: string) =>
    api.post<{ scannedAt: string; graph: GraphDTO }>(`/projects/${id}/scan`).then((r) => r.data),
  getInstrumentationPlan: (id: string) =>
    api.get<InstrumentationPlanDTO>(`/projects/${id}/instrumentation-plan`).then((r) => r.data),
  applyInstrumentation: (id: string) =>
    api.post<InstrumentationApplyResult>(`/projects/${id}/instrument`).then((r) => r.data),
};

export const ResourcesApi = {
  list: (projectId: string) =>
    api.get<ResourceDTO[]>('/resources', { params: { projectId } }).then((r) => r.data),
  get: (id: string) => api.get<ResourceDTO>(`/resources/${id}`).then((r) => r.data),
};

export interface EventListOptions {
  limit?: number;
  sessionId?: string;
  resourceId?: string;
}

export const EventsApi = {
  list: (projectId: string, opts: EventListOptions = {}) =>
    api
      .get<EventDTO[]>('/events', {
        params: { projectId, limit: opts.limit ?? 500, sessionId: opts.sessionId, resourceId: opts.resourceId },
      })
      .then((r) => r.data),
  sessions: (projectId: string) =>
    api.get('/events/sessions', { params: { projectId } }).then((r) => r.data),
};

export const GraphApi = {
  get: (projectId: string) => api.get<GraphDTO>('/graph', { params: { projectId } }).then((r) => r.data),
};

export type SpanType =
  | 'session' | 'user_prompt' | 'tool' | 'agent' | 'skill' | 'command' | 'hook' | 'other';

export interface CallSpanDTO {
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
  selfTimeMs: number | null;
  depth: number;
  open: boolean;
  children: CallSpanDTO[];
  payload?: Record<string, unknown>;
}

export interface SessionTraceDTO {
  sessionId: string;
  projectId: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  eventCount: number;
  root: CallSpanDTO;
}

export const TreeApi = {
  list: (projectId: string, sessionId?: string) =>
    api
      .get<SessionTraceDTO[]>('/tree', { params: { projectId, sessionId } })
      .then((r) => r.data),
};

export function connectEventStream(onEvent: (event: EventDTO) => void): WebSocket {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws/events`);
  ws.addEventListener('message', (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'event') onEvent(msg.data);
    } catch {
      // ignore
    }
  });
  return ws;
}
