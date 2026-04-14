import type { Resource } from '@agentflow/core';

// Well-known Claude Code built-in tools. AgentFlow surfaces them as synthetic
// resources so events can link to them and the Flowchart / Replay can highlight them.
//
// Tools that aren't in this list (e.g. MCP / plugin tools) are auto-created
// lazily by the Ingester the first time their events arrive.
const BUILTIN_TOOLS: Array<{ name: string; description: string }> = [
  { name: 'Read',          description: 'Read a file from the local filesystem' },
  { name: 'Write',         description: 'Write a new file to the local filesystem' },
  { name: 'Edit',          description: 'Apply an exact-string find/replace edit to a file' },
  { name: 'NotebookEdit',  description: 'Edit a Jupyter notebook cell' },
  { name: 'Glob',          description: 'Fast file pattern matching (e.g. **/*.ts)' },
  { name: 'Grep',          description: 'Ripgrep-powered content search' },
  { name: 'LS',            description: 'List files in a directory' },
  { name: 'Bash',          description: 'Execute a shell command in a persistent session' },
  { name: 'BashOutput',    description: 'Read output from a background bash task' },
  { name: 'KillBash',      description: 'Stop a running background bash task' },
  { name: 'Task',          description: 'Delegate a subtask to an agent' },
  { name: 'TodoWrite',     description: 'Update the structured task list for the session' },
  { name: 'WebFetch',      description: 'Fetch and parse a URL' },
  { name: 'WebSearch',     description: 'Run a web search query' },
  { name: 'ExitPlanMode',  description: 'Leave plan mode and start executing' },
  { name: 'SlashCommand',  description: 'Execute a slash command' },
];

export function discoverBuiltinTools(): Resource[] {
  return BUILTIN_TOOLS.map((t) => ({
    id: `claude-code:tool:${t.name}`,
    type: 'tool',
    name: t.name,
    filePath: '<builtin>',
    description: t.description,
    metadata: { scope: 'builtin', source: 'claude-code-builtin' },
    relations: [],
  }));
}

export function isKnownToolName(name: string): boolean {
  return BUILTIN_TOOLS.some((t) => t.name === name);
}
