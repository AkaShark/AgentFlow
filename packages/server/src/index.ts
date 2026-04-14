import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Prisma } from '@prisma/client';
import { Ingester } from '@agentflow/core';
import { registry } from './registry.js';
import { prisma } from './db.js';
import { createWebSocketServer, broadcastEvent } from './ws.js';
import { projectsRouter } from './routes/projects.js';
import { resourcesRouter } from './routes/resources.js';
import { eventsRouter } from './routes/events.js';
import { graphRouter } from './routes/graph.js';
import { treeRouter } from './routes/tree.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/projects', projectsRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/events', eventsRouter);
app.use('/api/graph', graphRouter);
app.use('/api/tree', treeRouter);

const server = http.createServer(app);
createWebSocketServer(server);

const eventsDir = process.env.AGENTFLOW_EVENTS_DIR ?? `${process.env.HOME}/.agentflow/events`;

// Positive-only cache of resourceId → exists. We never cache negatives because
// new resources can be added by a Scan after an event came in with an unknown
// reference; caching the miss would mean we'd never resolve it later.
const resourceExistsCache = new Set<string>();
async function resolveResourceId(
  id: string | undefined,
  projectId: string,
): Promise<string | null> {
  if (!id) return null;
  const suffix = `@proj:${projectId}`;
  const lookupId = id.endsWith(suffix) ? id : `${id}${suffix}`;
  if (resourceExistsCache.has(lookupId)) return lookupId;
  const found = await prisma.resource.findUnique({
    where: { id: lookupId },
    select: { id: true },
  });
  if (found) {
    resourceExistsCache.add(lookupId);
    return lookupId;
  }
  return null;
}

// Cache of projectId → exists. An event with an unknown projectId is dropped
// rather than crashing the ingester.
const projectExistsCache = new Map<string, boolean>();
async function projectExists(id: string): Promise<boolean> {
  if (projectExistsCache.has(id)) return projectExistsCache.get(id)!;
  const found = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  projectExistsCache.set(id, !!found);
  return !!found;
}

const ingester = new Ingester(registry, async (event) => {
  if (!(await projectExists(event.projectId))) {
    console.warn(`[agentflow] dropping event ${event.eventId}: unknown projectId ${event.projectId}`);
    return;
  }
  const resourceId = await resolveResourceId(event.resourceId, event.projectId);
  await prisma.event.upsert({
    where: { id: event.eventId },
    create: {
      id: event.eventId,
      projectId: event.projectId,
      sessionId: event.sessionId,
      adapterId: event.adapterId,
      type: event.type,
      resourceId,
      parentEventId: event.parentEventId,
      timestamp: new Date(event.timestamp),
      durationMs: event.durationMs ?? null,
      payload: event.payload as Prisma.InputJsonValue,
      meta: (event.meta ?? {}) as Prisma.InputJsonValue,
    },
    update: {},
  });
  broadcastEvent(event);
});
ingester.watch(eventsDir);

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';
server.listen(port, host, () => {
  console.log(`[agentflow] server listening on http://${host}:${port}`);
  console.log(`[agentflow] watching events at ${eventsDir}`);
});
