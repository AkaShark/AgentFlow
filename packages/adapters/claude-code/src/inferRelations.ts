import type { Resource } from '@agentflow/core';

const SUBAGENT_RE = /subagent[_-]?type[\s=:]+["']([^"']+)["']/gi;
const AGENT_TOOL_RE = /Agent\s*\(\s*[^)]*subagent_type\s*[:=]\s*["']([^"']+)["']/gi;

export function inferRelations(resources: Resource[]): Resource[] {
  const byNameLower = new Map<string, Resource>();
  for (const r of resources) byNameLower.set(r.name.toLowerCase(), r);

  for (const r of resources) {
    if (!r.rawContent) continue;
    if (r.type !== 'agent' && r.type !== 'command') continue;

    // 1. Static: explicit subagent_type references
    const explicitMatches = [
      ...r.rawContent.matchAll(SUBAGENT_RE),
      ...r.rawContent.matchAll(AGENT_TOOL_RE),
    ];
    for (const m of explicitMatches) {
      const target = byNameLower.get(m[1]!.toLowerCase());
      if (target && target.id !== r.id) {
        r.relations.push({ kind: 'calls', targetId: target.id, confidence: 'static' });
      }
    }

    // 2. Inferred: word-boundary mentions of any other agent/skill/tool name
    for (const [nameLower, target] of byNameLower) {
      if (target.id === r.id) continue;
      if (target.type !== 'skill' && target.type !== 'agent' && target.type !== 'tool') continue;
      if (nameLower.length < 3) continue;
      const re = new RegExp(`\\b${escapeRegex(nameLower)}\\b`, 'i');
      if (re.test(r.rawContent)) {
        r.relations.push({ kind: 'calls', targetId: target.id, confidence: 'inferred' });
      }
    }
  }

  // 3. Hooks: matcher field → tool name. Now that builtin tools are real resources,
  // we draw a triggeredBy edge from each tool to the hook(s) that watch it.
  // Matcher can be a regex like "Bash|Edit" or a literal name; we scan for any
  // tool name that appears as a word in the pattern.
  for (const r of resources) {
    if (r.type !== 'hook') continue;
    const matcher = (r.metadata as { matcher?: string }).matcher;
    if (!matcher) continue;
    if (matcher === '.*' || matcher === '*') continue; // catch-all, no specific tool

    for (const [nameLower, target] of byNameLower) {
      if (target.type !== 'tool') continue;
      const re = new RegExp(`\\b${escapeRegex(nameLower)}\\b`, 'i');
      if (re.test(matcher)) {
        r.relations.push({ kind: 'triggeredBy', targetId: target.id, confidence: 'static' });
      }
    }
  }

  // Dedupe (kind + targetId)
  for (const r of resources) {
    const seen = new Set<string>();
    r.relations = r.relations.filter((rel) => {
      const key = `${rel.kind}:${rel.targetId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return resources;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
