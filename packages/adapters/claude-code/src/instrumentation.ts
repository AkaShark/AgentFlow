import path from 'node:path';
import type { InstrumentationContext, InstrumentationPlan } from '@agentflow/core';

export function buildInstrumentationPlan(
  projectPath: string,
  ctx: InstrumentationContext,
): InstrumentationPlan {
  const forwarderPath = '.agentflow/hook-forwarder.mjs';
  const forwarderAbs = path.join(projectPath, forwarderPath);
  const eventsDirJs = ctx.eventsDir ? JSON.stringify(ctx.eventsDir) : 'null';

  return {
    files: [
      {
        path: forwarderPath,
        mode: 0o755,
        content: renderForwarder(ctx.projectId, eventsDirJs),
      },
    ],
    patches: [
      {
        path: '.claude/settings.json',
        operation: 'merge-json',
        payload: {
          hooks: {
            PreToolUse: [
              {
                matcher: '.*',
                hooks: [{ type: 'command', command: `node ${forwarderAbs} PreToolUse` }],
              },
            ],
            PostToolUse: [
              {
                matcher: '.*',
                hooks: [{ type: 'command', command: `node ${forwarderAbs} PostToolUse` }],
              },
            ],
            UserPromptSubmit: [
              { hooks: [{ type: 'command', command: `node ${forwarderAbs} UserPromptSubmit` }] },
            ],
            SessionStart: [
              { hooks: [{ type: 'command', command: `node ${forwarderAbs} SessionStart` }] },
            ],
            SessionEnd: [
              { hooks: [{ type: 'command', command: `node ${forwarderAbs} SessionEnd` }] },
            ],
          },
        },
      },
    ],
    instructions:
      `AgentFlow has injected a hook forwarder at ${forwarderPath} (projectId baked in)\n` +
      `and registered hooks in .claude/settings.json.\n` +
      `Events will be appended to ${ctx.eventsDir ?? '~/.agentflow/events'}/${ctx.projectId}.jsonl.\n` +
      `Restart your Claude Code session (or run it in a new terminal) to load the hooks.`,
  };
}

function renderForwarder(projectId: string, eventsDirJs: string): string {
  return `#!/usr/bin/env node
// AgentFlow hook forwarder — generated automatically. Do not edit.
// projectId is baked in below so this file is unique per project.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PROJECT_ID = ${JSON.stringify(projectId)};
const BAKED_EVENTS_DIR = ${eventsDirJs};

const hookEventName = process.argv[2] ?? 'unknown';
const eventsDir =
  process.env.AGENTFLOW_EVENTS_DIR
  ?? BAKED_EVENTS_DIR
  ?? path.join(os.homedir(), '.agentflow', 'events');

let stdin = '';
process.stdin.on('data', (chunk) => { stdin += chunk; });
process.stdin.on('end', () => {
  let payload = {};
  try { payload = JSON.parse(stdin); } catch { /* ignore */ }
  const event = {
    ...payload,
    hook_event_name: hookEventName,
    timestamp: new Date().toISOString(),
    af_project_id: PROJECT_ID,
  };
  fs.mkdirSync(eventsDir, { recursive: true });
  const file = path.join(eventsDir, PROJECT_ID + '.jsonl');
  fs.appendFileSync(file, JSON.stringify(event) + '\\n');
  process.exit(0);
});
`;
}
