import { Router } from 'express';
import { z } from 'zod';
import { Scanner, GraphBuilder } from '@agentflow/core';
import { prisma } from '../db.js';
import { registry } from '../registry.js';
import { applyInstrumentationPlan } from '../services/instrumentation.js';

export const projectsRouter: Router = Router();

projectsRouter.get('/', async (_req, res) => {
  const projects = await prisma.project.findMany({
    include: { _count: { select: { resources: true, events: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(projects);
});

const createSchema = z.object({
  rootPath: z.string().min(1),
  name: z.string().optional(),
});

projectsRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { rootPath, name } = parsed.data;

  const adapter = await registry.detect(rootPath);
  if (!adapter) {
    return res.status(400).json({ error: 'No adapter matched the given path' });
  }

  const project = await prisma.project.upsert({
    where: { rootPath },
    create: { rootPath, name: name ?? rootPath.split('/').pop() ?? 'project', adapterId: adapter.id },
    update: { name: name ?? undefined, adapterId: adapter.id },
  });

  res.status(201).json(project);
});

projectsRouter.delete('/:id', async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!project) return res.status(404).json({ error: 'project not found' });
  await prisma.project.delete({ where: { id: project.id } });
  res.json({ ok: true });
});

projectsRouter.post('/:id/scan', async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!project) return res.status(404).json({ error: 'project not found' });

  const scanner = new Scanner(registry);
  const result = await scanner.scan(project.rootPath);

  // Resource IDs from the adapter are NOT globally unique across projects:
  // `claude-code:hook:PostToolUse:.*:0@settings.json` would collide between
  // projects that both ran Install Hooks. We append a `@proj:<id>` suffix to
  // every resource id (and rewrite relation targets) before insert so each
  // project owns its own independent rows.
  const PROJECT_SUFFIX = `@proj:${project.id}`;
  const idMap = new Map<string, string>();
  for (const r of result.resources) {
    if (!r.id.endsWith(PROJECT_SUFFIX)) {
      idMap.set(r.id, `${r.id}${PROJECT_SUFFIX}`);
    }
  }
  for (const r of result.resources) {
    const newId = idMap.get(r.id);
    if (newId) r.id = newId;
    for (const rel of r.relations) {
      const newTarget = idMap.get(rel.targetId);
      if (newTarget) rel.targetId = newTarget;
    }
  }

  // Dedupe by id — adapters can occasionally surface the same resource twice
  // (e.g. a skill that lives in both `skills/foo/SKILL.md` and
  // `.claude/skills/foo/SKILL.md` inside a plugin). Last write wins.
  const dedup = new Map<string, (typeof result.resources)[number]>();
  for (const r of result.resources) dedup.set(r.id, r);
  result.resources = [...dedup.values()];

  await prisma.$transaction(
    async (tx) => {
      await tx.relation.deleteMany({ where: { source: { projectId: project.id } } });
      await tx.resource.deleteMany({ where: { projectId: project.id } });

      // Bulk insert with skipDuplicates so a stale row owned by another project
      // (or any concurrent scan racing) won't blow up the whole transaction.
      await tx.resource.createMany({
        data: result.resources.map((r) => ({
          id: r.id,
          projectId: project.id,
          type: r.type,
          name: r.name,
          filePath: r.filePath,
          description: r.description ?? null,
          metadata: r.metadata as object,
          rawContent: r.rawContent ?? null,
        })),
        skipDuplicates: true,
      });

      // Build relation rows, but only those whose source survived the insert.
      const insertedIds = new Set(
        (
          await tx.resource.findMany({
            where: { projectId: project.id },
            select: { id: true },
          })
        ).map((r) => r.id),
      );

      const relationRows: Array<{
        sourceId: string;
        targetId: string;
        kind: string;
        confidence: string;
      }> = [];
      for (const r of result.resources) {
        if (!insertedIds.has(r.id)) continue;
        for (const rel of r.relations) {
          relationRows.push({
            sourceId: r.id,
            targetId: rel.targetId,
            kind: rel.kind,
            confidence: rel.confidence,
          });
        }
      }
      if (relationRows.length) {
        await tx.relation.createMany({ data: relationRows, skipDuplicates: true });
      }
    },
    { timeout: 30000 },
  );

  const builder = new GraphBuilder();
  res.json({ scannedAt: result.scannedAt, graph: builder.build(result.resources) });
});

function buildContext(projectId: string) {
  return {
    projectId,
    eventsDir: process.env.AGENTFLOW_EVENTS_DIR,
  };
}

projectsRouter.get('/:id/instrumentation-plan', async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!project) return res.status(404).json({ error: 'project not found' });

  const adapter = registry.get(project.adapterId);
  if (!adapter) return res.status(400).json({ error: 'adapter not found' });

  const plan = adapter.getInstrumentationSetup(project.rootPath, buildContext(project.id));
  res.json(plan);
});

projectsRouter.post('/:id/instrument', async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!project) return res.status(404).json({ error: 'project not found' });

  const adapter = registry.get(project.adapterId);
  if (!adapter) return res.status(400).json({ error: 'adapter not found' });

  const plan = adapter.getInstrumentationSetup(project.rootPath, buildContext(project.id));
  const result = await applyInstrumentationPlan(project.rootPath, plan);
  res.json({ ok: true, ...result, instructions: plan.instructions });
});
