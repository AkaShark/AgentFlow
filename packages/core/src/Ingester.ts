import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import chokidar from 'chokidar';
import type { AdapterRegistry } from './AdapterRegistry.js';
import type { AgentEvent } from './types/event.js';

export type EventSink = (event: AgentEvent) => Promise<void> | void;

export class Ingester {
  private offsets = new Map<string, number>();

  constructor(
    private registry: AdapterRegistry,
    private sink: EventSink,
  ) {}

  watch(eventsDir: string): chokidar.FSWatcher {
    const watcher = chokidar.watch(`${eventsDir}/*.jsonl`, {
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });

    watcher.on('add', (path) => this.processFile(path));
    watcher.on('change', (path) => this.processFile(path));

    return watcher;
  }

  private async processFile(path: string): Promise<void> {
    const start = this.offsets.get(path) ?? 0;
    const stream = createReadStream(path, { start });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    let bytes = start;
    for await (const line of rl) {
      bytes += Buffer.byteLength(line, 'utf8') + 1;
      if (!line.trim()) continue;
      const event = this.dispatch(line);
      if (event) await this.sink(event);
    }
    this.offsets.set(path, bytes);
  }

  private dispatch(line: string): AgentEvent | null {
    for (const adapter of this.registry.list()) {
      try {
        const event = adapter.parseEvent(line);
        if (event) return event;
      } catch {
        // try next adapter
      }
    }
    return null;
  }
}
