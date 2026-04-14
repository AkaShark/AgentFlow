import path from 'node:path';
import fs from 'node:fs/promises';
import type {
  AgentAdapter,
  AgentEvent,
  InstrumentationContext,
  InstrumentationPlan,
  Resource,
} from '@agentflow/core';
import { discoverClaudeResources } from './discoverResources.js';
import { parseClaudeResource } from './parseResource.js';
import { parseClaudeEvent } from './parseEvent.js';
import { buildInstrumentationPlan } from './instrumentation.js';

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly id = 'claude-code';
  readonly displayName = 'Claude Code';

  async detect(projectPath: string): Promise<number> {
    const candidates = [
      path.join(projectPath, '.claude'),
      path.join(projectPath, '.claude', 'settings.json'),
      path.join(projectPath, 'CLAUDE.md'),
    ];
    for (const c of candidates) {
      try {
        await fs.access(c);
        return 1.0;
      } catch {
        // continue
      }
    }
    return 0;
  }

  discoverResources(projectPath: string): Promise<Resource[]> {
    return discoverClaudeResources(projectPath);
  }

  parseResource(filePath: string): Promise<Resource> {
    return parseClaudeResource(filePath);
  }

  getInstrumentationSetup(projectPath: string, ctx: InstrumentationContext): InstrumentationPlan {
    return buildInstrumentationPlan(projectPath, ctx);
  }

  parseEvent(rawLine: string): AgentEvent | null {
    return parseClaudeEvent(rawLine);
  }
}

export const claudeCodeAdapter = new ClaudeCodeAdapter();
