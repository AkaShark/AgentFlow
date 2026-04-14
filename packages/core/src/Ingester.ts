import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
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
      awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 40 },
    });

    watcher.on('add', (path) => this.processFile(path));
    watcher.on('change', (path) => this.processFile(path));
    watcher.on('unlink', (path) => {
      // File was removed — drop the offset so a future re-creation starts fresh.
      this.offsets.delete(path);
    });

    return watcher;
  }

  private async processFile(path: string): Promise<void> {
    let size = 0;
    try {
      size = (await stat(path)).size;
    } catch {
      return;
    }
    let start = this.offsets.get(path) ?? 0;
    // Handle truncation / rm+recreate: if the file is smaller than our cached
    // offset, the old file is gone — re-read from the top.
    if (size < start) start = 0;
    if (size === 0) {
      this.offsets.set(path, 0);
      return;
    }
    if (size === start) return; // nothing new

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
