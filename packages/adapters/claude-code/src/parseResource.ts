import path from 'node:path';
import fs from 'node:fs/promises';
import matter from 'gray-matter';
import type { Resource, ResourceType } from '@agentflow/core';

export async function parseClaudeResource(filePath: string): Promise<Resource> {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;

  const type = inferType(filePath);
  const name = (fm.name as string | undefined) ?? path.basename(filePath, path.extname(filePath));

  return {
    id: `claude-code:${type}:${name}`,
    type,
    name,
    filePath,
    description: fm.description as string | undefined,
    metadata: fm,
    relations: [],
    rawContent: parsed.content.slice(0, 4000),
  };
}

function inferType(filePath: string): ResourceType {
  if (filePath.includes('/skills/')) return 'skill';
  if (filePath.includes('/agents/')) return 'agent';
  if (filePath.includes('/commands/')) return 'command';
  return 'skill';
}
