import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import fg from 'fast-glob';
import type { Resource } from '@agentflow/core';
import { parseClaudeResource } from './parseResource.js';
import { inferRelations } from './inferRelations.js';
import { discoverPluginResources } from './discoverPlugins.js';
import { discoverBuiltinTools } from './discoverTools.js';

export async function discoverClaudeResources(projectPath: string): Promise<Resource[]> {
  const resources: Resource[] = [];

  // ---------- builtin tools ----------
  // Always present, regardless of project content. Lets hooks/agents/commands
  // form edges to known tools and lets runtime events resolve resourceId -> Resource.
  resources.push(...discoverBuiltinTools());

  // ---------- project scope ----------
  await collectResources(projectPath, 'project', resources);

  // Universal skills location (.agents/skills/), used by `npx skills` and shared
  // across multiple AI agents — Claude Code reads from here too.
  const agentsSkillFiles = await fg('.agents/skills/**/SKILL.md', {
    cwd: projectPath,
    absolute: true,
  });
  for (const f of agentsSkillFiles) {
    const r = await parseClaudeResource(f);
    r.metadata = { ...r.metadata, scope: 'project', source: '.agents/skills' };
    resources.push(r);
  }

  // Hooks: parse both settings.json and settings.local.json.
  for (const fname of ['settings.json', 'settings.local.json']) {
    const settingsPath = path.join(projectPath, '.claude', fname);
    await collectHooks(settingsPath, resources);
  }

  // ---------- user scope (~/.claude) ----------
  const userClaudeDir = path.join(os.homedir(), '.claude');
  await collectResources(userClaudeDir, 'user', resources);

  // ---------- plugins enabled in this project ----------
  resources.push(...(await discoverPluginResources(projectPath)));

  return inferRelations(resources);
}

async function collectResources(
  baseDir: string,
  scope: 'project' | 'user',
  out: Resource[],
): Promise<void> {
  const claudeDir = scope === 'project' ? path.join(baseDir, '.claude') : baseDir;
  try {
    await fs.access(claudeDir);
  } catch {
    return;
  }

  const skillFiles = await fg('skills/**/SKILL.md', { cwd: claudeDir, absolute: true });
  const agentFiles = await fg('agents/**/*.md', { cwd: claudeDir, absolute: true });
  const commandFiles = await fg('commands/**/*.md', { cwd: claudeDir, absolute: true });

  for (const f of [...skillFiles, ...agentFiles, ...commandFiles]) {
    const r = await parseClaudeResource(f);
    if (scope === 'user') {
      // Avoid id collisions between project-level and user-level resources with the same name.
      r.id = `${r.id}@user`;
    }
    r.metadata = { ...r.metadata, scope };
    out.push(r);
  }
}

async function collectHooks(settingsPath: string, out: Resource[]): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(settingsPath, 'utf8');
  } catch {
    return;
  }
  let settings: { hooks?: Record<string, unknown[]> };
  try {
    settings = JSON.parse(raw);
  } catch {
    return;
  }
  if (!settings.hooks) return;

  const fileTag = path.basename(settingsPath);
  for (const [hookEvent, entries] of Object.entries(settings.hooks)) {
    if (!Array.isArray(entries)) continue;
    entries.forEach((entry, idx) => {
      const matcher = (entry as { matcher?: string }).matcher ?? '*';
      out.push({
        id: `claude-code:hook:${hookEvent}:${matcher}:${idx}@${fileTag}`,
        type: 'hook',
        name: `${hookEvent}/${matcher}`,
        filePath: settingsPath,
        description: `${hookEvent} hook for ${matcher} (${fileTag})`,
        metadata: { hookEvent, matcher, source: fileTag, raw: entry, scope: 'project' },
        relations: [],
      });
    });
  }
}
