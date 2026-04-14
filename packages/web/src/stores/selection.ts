import { defineStore } from 'pinia';
import { ResourcesApi, type ResourceDTO, type EventDTO } from '@/api/client';

export type Selection =
  | { kind: 'resource'; id: string }
  | { kind: 'event'; event: EventDTO }
  | null;

export type ResourceTypeKey = 'skill' | 'agent' | 'command' | 'hook' | 'tool';
export type ScopeKey = 'project' | 'user' | 'plugin' | 'builtin';

interface State {
  selection: Selection;
  resourceCache: Record<string, ResourceDTO>;
  loading: boolean;

  // Flowchart filters
  searchQuery: string;
  typeFilter: ResourceTypeKey[];
  scopeFilter: ScopeKey[];

  // Cross-view linking: when set, Timeline filters to this resource's events
  pinnedResourceId: string | null;

  // Session replay
  replayActive: boolean;
  replayTimestamp: string | null; // ISO; null = follow live
  replayWindowMs: number; // events within this window count as "active"
  activeResourceIds: string[]; // resource IDs currently "active" in replay
}

const ALL_TYPES: ResourceTypeKey[] = ['skill', 'agent', 'command', 'hook', 'tool'];
const ALL_SCOPES: ScopeKey[] = ['project', 'user', 'plugin', 'builtin'];

export const useSelectionStore = defineStore('selection', {
  state: (): State => ({
    selection: null,
    resourceCache: {},
    loading: false,
    searchQuery: '',
    typeFilter: [...ALL_TYPES],
    scopeFilter: [...ALL_SCOPES],
    pinnedResourceId: null,
    replayActive: false,
    replayTimestamp: null,
    replayWindowMs: 5000,
    activeResourceIds: [],
  }),
  getters: {
    isOpen(state): boolean {
      return state.selection !== null;
    },
    currentResource(state): ResourceDTO | null {
      if (state.selection?.kind !== 'resource') return null;
      return state.resourceCache[state.selection.id] ?? null;
    },
    currentEvent(state): EventDTO | null {
      return state.selection?.kind === 'event' ? state.selection.event : null;
    },
  },
  actions: {
    async selectResource(id: string) {
      this.selection = { kind: 'resource', id };
      if (!this.resourceCache[id]) {
        this.loading = true;
        try {
          this.resourceCache[id] = await ResourcesApi.get(id);
        } finally {
          this.loading = false;
        }
      }
    },
    selectEvent(event: EventDTO) {
      this.selection = { kind: 'event', event };
    },
    clear() {
      this.selection = null;
    },
    pinResource(id: string | null) {
      this.pinnedResourceId = id;
    },
    setSearch(q: string) {
      this.searchQuery = q;
    },
    toggleType(t: ResourceTypeKey) {
      if (this.typeFilter.includes(t)) {
        this.typeFilter = this.typeFilter.filter((x) => x !== t);
      } else {
        this.typeFilter = [...this.typeFilter, t];
      }
    },
    toggleScope(s: ScopeKey) {
      if (this.scopeFilter.includes(s)) {
        this.scopeFilter = this.scopeFilter.filter((x) => x !== s);
      } else {
        this.scopeFilter = [...this.scopeFilter, s];
      }
    },
    resetFilters() {
      this.searchQuery = '';
      this.typeFilter = [...ALL_TYPES];
      this.scopeFilter = [...ALL_SCOPES];
    },
    setReplay(active: boolean) {
      this.replayActive = active;
      if (!active) this.replayTimestamp = null;
    },
    setReplayTime(ts: string | null) {
      this.replayTimestamp = ts;
    },
    setActiveResources(ids: string[]) {
      this.activeResourceIds = ids;
    },
  },
});
