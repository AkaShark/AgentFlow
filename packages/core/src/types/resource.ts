export type ResourceType = 'skill' | 'agent' | 'command' | 'hook' | 'tool';

export type RelationKind = 'calls' | 'triggeredBy' | 'references';

export interface ResourceRelation {
  kind: RelationKind;
  targetId: string;
  confidence: 'static' | 'inferred';
}

export interface Resource {
  id: string;
  type: ResourceType;
  name: string;
  filePath: string;
  description?: string;
  metadata: Record<string, unknown>;
  relations: ResourceRelation[];
  rawContent?: string;
}
