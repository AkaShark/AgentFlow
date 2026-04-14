import { Router } from 'express';
import { prisma } from '../db.js';

export const eventsRouter: Router = Router();

eventsRouter.get('/', async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const sessionId = req.query.sessionId as string | undefined;
  const resourceId = req.query.resourceId as string | undefined;
  const limit = Math.min(Number(req.query.limit ?? 200), 2000);

  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const events = await prisma.event.findMany({
    where: {
      projectId,
      ...(sessionId ? { sessionId } : {}),
      ...(resourceId ? { resourceId } : {}),
    },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
  res.json(events);
});

eventsRouter.get('/sessions', async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const sessions = await prisma.event.groupBy({
    by: ['sessionId'],
    where: { projectId },
    _count: { _all: true },
    _min: { timestamp: true },
    _max: { timestamp: true },
    orderBy: { _max: { timestamp: 'desc' } },
  });
  res.json(sessions);
});
