import type { AgentAdapter } from './types/adapter.js';

export class AdapterRegistry {
  private adapters = new Map<string, AgentAdapter>();

  register(adapter: AgentAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Adapter with id "${adapter.id}" already registered`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): AgentAdapter | undefined {
    return this.adapters.get(id);
  }

  list(): AgentAdapter[] {
    return [...this.adapters.values()];
  }

  async detect(projectPath: string): Promise<AgentAdapter | null> {
    const scored = await Promise.all(
      this.list().map(async (adapter) => ({
        adapter,
        score: await adapter.detect(projectPath),
      })),
    );
    const best = scored
      .filter((s) => s.score > 0.5)
      .sort((a, b) => b.score - a.score)[0];
    return best?.adapter ?? null;
  }
}
