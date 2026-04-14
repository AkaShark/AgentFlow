import path from 'node:path';
import fs from 'node:fs/promises';
import type { InstrumentationPlan } from '@agentflow/core';

export interface ApplyResult {
  written: string[];
  patched: string[];
}

export async function applyInstrumentationPlan(
  projectPath: string,
  plan: InstrumentationPlan,
): Promise<ApplyResult> {
  const written: string[] = [];
  const patched: string[] = [];

  for (const file of plan.files) {
    const abs = path.join(projectPath, file.path);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, file.content, 'utf8');
    if (file.mode != null) await fs.chmod(abs, file.mode);
    written.push(file.path);
  }

  for (const patch of plan.patches) {
    const abs = path.join(projectPath, patch.path);
    if (patch.operation === 'merge-json') {
      let existing: Record<string, unknown> = {};
      try {
        existing = JSON.parse(await fs.readFile(abs, 'utf8')) as Record<string, unknown>;
      } catch {
        // file missing or invalid — start fresh
      }
      const merged = deepMerge(existing, patch.payload as Record<string, unknown>);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, JSON.stringify(merged, null, 2) + '\n', 'utf8');
      patched.push(patch.path);
    } else if (patch.operation === 'append') {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.appendFile(abs, String(patch.payload), 'utf8');
      patched.push(patch.path);
    }
  }

  return { written, patched };
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: T): T {
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const prev = out[key];
    if (Array.isArray(prev) && Array.isArray(value)) {
      out[key] = [...prev, ...value];
    } else if (isPlainObject(prev) && isPlainObject(value)) {
      out[key] = deepMerge(prev, value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
