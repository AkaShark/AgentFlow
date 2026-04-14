import { Router } from 'express';
import { prisma } from '../db.js';
import { buildSessionTraces, type RawEventRow } from '../services/callTree.js';

export const treeRouter: Router = Router();

treeRouter.get('/', async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const sessionId = req.query.sessionId as string | undefined;
  const limit = Math.min(Number(req.query.limit ?? 5000), 20000);

  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const events = await prisma.event.findMany({
    where: {
      projectId,
      ...(sessionId ? { sessionId } : {}),
    },
    orderBy: { timestamp: 'asc' },
    take: limit,
  });

  const rows: RawEventRow[] = events.map((e) => ({
    id: e.id,
    sessionId: e.sessionId,
    projectId: e.projectId,
    type: e.type,
    resourceId: e.resourceId,
    timestamp: e.timestamp,
    durationMs: e.durationMs,
    payload: e.payload,
  }));

  const traces = buildSessionTraces(rows);
  res.json(traces);
});
