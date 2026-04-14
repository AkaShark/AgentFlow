import type { Resource } from './types/resource.js';

export interface GraphNode {
  id: string;
  label: string;
  type: Resource['type'];
  description?: string;
  scope?: 'project' | 'user' | 'plugin';
  plugin?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: 'calls' | 'triggeredBy' | 'references';
  confidence: 'static' | 'inferred';
}

export interface ResourceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class GraphBuilder {
  build(resources: Resource[]): ResourceGraph {
    const nodes: GraphNode[] = resources.map((r) => {
      const meta = r.metadata as { scope?: 'project' | 'user' | 'plugin'; plugin?: string };
      return {
        id: r.id,
        label: r.name,
        type: r.type,
        description: r.description,
        scope: meta.scope,
        plugin: meta.plugin,
      };
    });

    const ids = new Set(nodes.map((n) => n.id));
    const edges: GraphEdge[] = [];
    for (const r of resources) {
      for (const rel of r.relations) {
        if (!ids.has(rel.targetId)) continue;
        edges.push({
          source: r.id,
          target: rel.targetId,
          kind: rel.kind,
          confidence: rel.confidence,
        });
      }
    }
    return { nodes, edges };
  }
}
