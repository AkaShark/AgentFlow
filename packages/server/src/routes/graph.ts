import { Router } from 'express';
import { GraphBuilder } from '@agentflow/core';
import { prisma } from '../db.js';

export const graphRouter: Router = Router();

graphRouter.get('/', async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const resources = await prisma.resource.findMany({
    where: { projectId },
    include: { outRelations: true },
  });

  const builder = new GraphBuilder();
  const graph = builder.build(
    resources.map((r) => ({
      id: r.id,
      type: r.type as 'skill' | 'agent' | 'command' | 'hook',
      name: r.name,
      filePath: r.filePath,
      description: r.description ?? undefined,
      metadata: r.metadata as Record<string, unknown>,
      relations: r.outRelations.map((rel) => ({
        kind: rel.kind as 'calls' | 'triggeredBy' | 'references',
        targetId: rel.targetId,
        confidence: rel.confidence as 'static' | 'inferred',
      })),
    })),
  );
  res.json(graph);
});
