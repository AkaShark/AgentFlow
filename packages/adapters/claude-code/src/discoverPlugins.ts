import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import fg from 'fast-glob';
import type { Resource } from '@agentflow/core';
import { parseClaudeResource } from './parseResource.js';

interface InstalledPluginRecord {
  scope: 'user' | 'local';
  projectPath?: string;
  installPath: string;
  version: string;
}

interface InstalledPluginsFile {
  version: number;
  plugins: Record<string, InstalledPluginRecord[]>;
}

export async function discoverPluginResources(projectPath: string): Promise<Resource[]> {
  const enabled = await readEnabledPlugins(projectPath);
  if (enabled.size === 0) return [];

  const installed = await readInstalledPlugins();
  if (!installed) return [];

  const out: Resource[] = [];
  for (const pluginKey of enabled) {
    const records = installed.plugins[pluginKey];
    if (!records?.length) continue;

    // Prefer a record installed for this exact project, else fall back to user scope.
    const record =
      records.find((r) => r.projectPath === projectPath) ??
      records.find((r) => r.scope === 'user') ??
      records[0];
    if (!record) continue;

    out.push(...(await scanPluginDir(record.installPath, pluginKey, record.version)));
  }
  return out;
}

async function readEnabledPlugins(projectPath: string): Promise<Set<string>> {
  const enabled = new Set<string>();
  for (const fname of ['settings.json', 'settings.local.json']) {
    const p = path.join(projectPath, '.claude', fname);
    try {
      const raw = await fs.readFile(p, 'utf8');
      const data = JSON.parse(raw) as { enabledPlugins?: Record<string, boolean> };
      if (data.enabledPlugins) {
        for (const [k, v] of Object.entries(data.enabledPlugins)) {
          if (v) enabled.add(k);
        }
      }
    } catch {
      // file missing or invalid — that's fine
    }
  }
  return enabled;
}

async function readInstalledPlugins(): Promise<InstalledPluginsFile | null> {
  const p = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw) as InstalledPluginsFile;
  } catch {
    return null;
  }
}

async function scanPluginDir(
  installPath: string,
  pluginKey: string,
  version: string,
): Promise<Resource[]> {
  const out: Resource[] = [];

  // Look in both flat (skills/, agents/, commands/) and .claude/ scoped dirs.
  const skillFiles = await fg(
    ['skills/**/SKILL.md', '.claude/skills/**/SKILL.md'],
    { cwd: installPath, absolute: true },
  );
  const agentFiles = await fg(
    ['agents/**/*.md', '.claude/agents/**/*.md'],
    { cwd: installPath, absolute: true },
  );
  const commandFiles = await fg(
    ['commands/**/*.md', '.claude/commands/**/*.md'],
    { cwd: installPath, absolute: true },
  );

  for (const f of [...skillFiles, ...agentFiles, ...commandFiles]) {
    try {
      const r = await parseClaudeResource(f);
      r.id = `${r.id}@plugin:${pluginKey}`;
      r.metadata = { ...r.metadata, scope: 'plugin', plugin: pluginKey, pluginVersion: version };
      out.push(r);
    } catch {
      // skip files that fail to parse
    }
  }

  // Plugin-shipped hooks
  for (const setFile of ['settings.json', 'settings.local.json']) {
    const sp = path.join(installPath, '.claude', setFile);
    let raw: string;
    try {
      raw = await fs.readFile(sp, 'utf8');
    } catch {
      continue;
    }
    let settings: { hooks?: Record<string, unknown[]> };
    try {
      settings = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!settings.hooks) continue;

    for (const [hookEvent, entries] of Object.entries(settings.hooks)) {
      if (!Array.isArray(entries)) continue;
      entries.forEach((entry, idx) => {
        const matcher = (entry as { matcher?: string }).matcher ?? '*';
        out.push({
          id: `claude-code:hook:${hookEvent}:${matcher}:${idx}@plugin:${pluginKey}`,
          type: 'hook',
          name: `${hookEvent}/${matcher}`,
          filePath: sp,
          description: `${hookEvent} hook from ${pluginKey}`,
          metadata: {
            hookEvent,
            matcher,
            scope: 'plugin',
            plugin: pluginKey,
            pluginVersion: version,
            raw: entry,
          },
          relations: [],
        });
      });
    }
  }

  return out;
}
