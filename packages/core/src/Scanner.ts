import type { AdapterRegistry } from './AdapterRegistry.js';
import type { Resource } from './types/resource.js';

export interface ScanResult {
  adapterId: string;
  projectPath: string;
  resources: Resource[];
  scannedAt: string;
}

export class Scanner {
  constructor(private registry: AdapterRegistry) {}

  async scan(projectPath: string): Promise<ScanResult> {
    const adapter = await this.registry.detect(projectPath);
    if (!adapter) {
      throw new Error(`No AgentAdapter matched project at ${projectPath}`);
    }

    const resources = await adapter.discoverResources(projectPath);

    return {
      adapterId: adapter.id,
      projectPath,
      resources,
      scannedAt: new Date().toISOString(),
    };
  }
}
