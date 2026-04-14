import type { Resource } from './resource.js';
import type { AgentEvent } from './event.js';

export interface InstrumentationFile {
  path: string;
  content: string;
  mode?: number;
}

export interface InstrumentationPatch {
  path: string;
  operation: 'merge-json' | 'append';
  payload: unknown;
}

export interface InstrumentationPlan {
  files: InstrumentationFile[];
  patches: InstrumentationPatch[];
  instructions: string;
}

export interface InstrumentationContext {
  /** Stable AgentFlow project ID baked into the forwarder so events route correctly. */
  projectId: string;
  /** Where the Ingester is watching; baked into the forwarder if provided. */
  eventsDir?: string;
}

export interface AgentAdapter {
  readonly id: string;
  readonly displayName: string;

  detect(projectPath: string): Promise<number>;
  discoverResources(projectPath: string): Promise<Resource[]>;
  parseResource(filePath: string): Promise<Resource>;
  getInstrumentationSetup(projectPath: string, context: InstrumentationContext): InstrumentationPlan;
  parseEvent(rawLine: string): AgentEvent | null;
}
