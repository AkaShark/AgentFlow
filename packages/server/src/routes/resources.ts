import { Router } from 'express';
import { prisma } from '../db.js';

export const resourcesRouter: Router = Router();

resourcesRouter.get('/', async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const resources = await prisma.resource.findMany({
    where: { projectId },
    include: { _count: { select: { events: true } } },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });
  res.json(resources);
});

resourcesRouter.get('/:id', async (req, res) => {
  const resource = await prisma.resource.findUnique({
    where: { id: req.params.id },
    include: { outRelations: true, inRelations: true },
  });
  if (!resource) return res.status(404).json({ error: 'not found' });
  res.json(resource);
});
