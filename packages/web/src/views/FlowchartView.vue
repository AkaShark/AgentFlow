<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, nextTick, ref, shallowRef, watch } from 'vue';
import {
  NCard, NEmpty, NSpin, NSpace, NTag, NInput, NCheckbox, NButton, NTooltip,
} from 'naive-ui';
import { Graph } from '@antv/g6';
import { GraphApi, type GraphDTO, type GraphNodeDTO, type GraphEdgeDTO } from '@/api/client';
import { useProjectStore } from '@/stores/project';
import { useSelectionStore, type ResourceTypeKey, type ScopeKey } from '@/stores/selection';

const projectStore = useProjectStore();
const selectionStore = useSelectionStore();

const loading = ref(false);
const data = ref<GraphDTO | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const graphRef = shallowRef<Graph | null>(null);
let resizeObserver: ResizeObserver | null = null;

const TYPE_COLOR: Record<string, string> = {
  skill: '#6ee7ff',
  agent: '#a06bff',
  command: '#4ade80',
  hook: '#fb923c',
  tool: '#f472b6',
};

const TYPE_OPTIONS: ResourceTypeKey[] = ['skill', 'agent', 'command', 'hook', 'tool'];
const SCOPE_OPTIONS: ScopeKey[] = ['project', 'user', 'plugin', 'builtin'];

const filteredGraph = computed<GraphDTO>(() => {
  if (!data.value) return { nodes: [], edges: [] };
  const q = selectionStore.searchQuery.trim().toLowerCase();
  const types = new Set(selectionStore.typeFilter);
  const scopes = new Set(selectionStore.scopeFilter);

  const nodes = data.value.nodes.filter((n) => {
    if (!types.has(n.type as ResourceTypeKey)) return false;
    const scope = (n.scope ?? 'project') as ScopeKey;
    if (!scopes.has(scope)) return false;
    if (q && !n.label.toLowerCase().includes(q) && !(n.plugin?.toLowerCase().includes(q))) return false;
    return true;
  });
  const ids = new Set(nodes.map((n) => n.id));
  const edges = data.value.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  return { nodes, edges };
});

const stats = computed(() => {
  const total = data.value?.nodes.length ?? 0;
  const visible = filteredGraph.value.nodes.length;
  return { total, visible };
});

async function load(id: string) {
  loading.value = true;
  try {
    data.value = await GraphApi.get(id);
  } finally {
    loading.value = false;
  }
  // The filteredGraph watch will pick this up and render — no double call here.
}

let renderToken = 0;
async function renderGraph() {
  const myToken = ++renderToken;
  destroyGraph();
  await nextTick();
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  if (myToken !== renderToken) return; // a newer render took over

  const el = containerRef.value;
  if (!el) return;
  const fg = filteredGraph.value;
  if (!fg.nodes.length) return;

  const width = el.clientWidth || 800;
  const height = el.clientHeight || 600;

  const g = new Graph({
    container: el,
    width,
    height,
    background: 'transparent',
    data: {
      nodes: fg.nodes.map((n) => ({
        id: n.id,
        data: { label: n.label, type: n.type, description: n.description, scope: n.scope, plugin: n.plugin },
      })),
      edges: fg.edges.map((e, idx) => ({
        id: `e-${idx}`,
        source: e.source,
        target: e.target,
        data: { kind: e.kind, confidence: e.confidence },
      })),
    },
    node: {
      type: 'circle',
      style: {
        size: (d: any) => (d.data?.scope === 'plugin' ? 26 : 36),
        fill: (d: any) => TYPE_COLOR[d.data?.type] ?? '#6ee7ff',
        fillOpacity: 0.9,
        stroke: '#0b1020',
        lineWidth: 2,
        labelText: (d: any) => d.data?.label ?? '',
        labelFill: '#e6ecf7',
        labelFontSize: 11,
        labelFontWeight: 500,
        labelPlacement: 'bottom',
        labelOffsetY: 6,
        labelBackground: true,
        labelBackgroundFill: 'rgba(13,19,32,0.75)',
        labelBackgroundRadius: 4,
        labelPadding: [2, 6],
        shadowColor: (d: any) => TYPE_COLOR[d.data?.type] ?? '#6ee7ff',
        shadowBlur: 14,
        cursor: 'pointer',
      },
      state: {
        selected: { lineWidth: 4, stroke: '#ffffff', shadowBlur: 24 },
        active: { lineWidth: 4, stroke: '#fde047', shadowColor: '#fde047', shadowBlur: 28 },
      },
    },
    edge: {
      type: 'line',
      style: {
        stroke: (d: any) => (d.data?.confidence === 'static' ? '#6ee7ff' : '#94a3b8'),
        strokeOpacity: 0.5,
        lineWidth: 1.4,
        lineDash: (d: any) => (d.data?.confidence === 'inferred' ? [4, 4] : undefined),
        endArrow: true,
        endArrowSize: 7,
        labelText: (d: any) => d.data?.kind ?? '',
        labelFill: '#94a3b8',
        labelFontSize: 9,
        labelBackground: true,
        labelBackgroundFill: 'rgba(13,19,32,0.7)',
        labelBackgroundRadius: 3,
        labelPadding: [1, 4],
        labelOpacity: 0,
      },
      state: {
        active: { strokeOpacity: 1, lineWidth: 2.5, labelOpacity: 1 },
      },
    },
    layout: {
      type: 'd3-force',
      link: { distance: 160, strength: 0.6 },
      manyBody: { strength: -380 },
      collide: { radius: 44 },
      x: { strength: 0.04 },
      y: { strength: 0.04 },
    },
    behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
  });

  g.on('node:click', (evt: any) => {
    const id = evt?.target?.id ?? evt?.itemId;
    if (typeof id === 'string') {
      selectionStore.selectResource(id);
      selectionStore.pinResource(id);
    }
  });

  g.on('node:pointerenter', (evt: any) => {
    const id = evt?.target?.id ?? evt?.itemId;
    if (typeof id !== 'string') return;
    try {
      const edges = g.getRelatedEdgesData(id);
      for (const e of edges) g.setElementState(e.id as string, ['active']);
    } catch { /* noop */ }
  });
  g.on('node:pointerleave', () => {
    try {
      const allEdges = g.getEdgeData();
      for (const e of allEdges) g.setElementState(e.id as string, []);
    } catch { /* noop */ }
  });

  await g.render();
  setTimeout(() => { try { g.fitView(); } catch { /* noop */ } }, 80);
  setTimeout(() => { try { g.fitView(); } catch { /* noop */ } }, 500);

  graphRef.value = g;
  applyHighlights();
}

function applyHighlights() {
  const g = graphRef.value;
  if (!g) return;
  try {
    // Reset states
    const allNodes = g.getNodeData();
    for (const n of allNodes) g.setElementState(n.id as string, []);

    // Selected
    if (selectionStore.selection?.kind === 'resource') {
      g.setElementState(selectionStore.selection.id, ['selected']);
    }
    // Active (replay)
    for (const id of selectionStore.activeResourceIds) {
      g.setElementState(id, ['active']);
    }
  } catch { /* noop */ }
}

function destroyGraph() {
  if (graphRef.value) {
    try { graphRef.value.destroy(); } catch { /* noop */ }
    graphRef.value = null;
  }
  // Wipe any stray <canvas> children that G6 may have left behind.
  const el = containerRef.value;
  if (el) while (el.firstChild) el.removeChild(el.firstChild);
}

watch(() => projectStore.currentId, (id) => { if (id) load(id); });
watch(filteredGraph, () => renderGraph(), { deep: false });
watch(
  () => [selectionStore.selection, selectionStore.activeResourceIds] as const,
  () => applyHighlights(),
  { deep: true },
);

onMounted(async () => {
  if (projectStore.currentId) await load(projectStore.currentId);

  resizeObserver = new ResizeObserver(() => {
    const g = graphRef.value;
    const el = containerRef.value;
    if (!g || !el) return;
    try {
      g.setSize(el.clientWidth, el.clientHeight);
      g.fitView();
    } catch { /* noop */ }
  });
  if (containerRef.value) resizeObserver.observe(containerRef.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  destroyGraph();
});
</script>

<template>
  <NCard title="Static Flowchart" class="view-card" :bordered="false">
    <template #header-extra>
      <NSpace size="small" align="center">
        <NTag size="small" :bordered="false" :color="{ color: '#6ee7ff15', textColor: '#94a3b8' }">
          {{ stats.visible }} / {{ stats.total }}
        </NTag>
        <NTag size="small" :bordered="false" :color="{ color: '#f472b622', textColor: '#f472b6' }">tool</NTag>
      </NSpace>
    </template>

    <div class="toolbar">
      <NInput
        :value="selectionStore.searchQuery"
        size="small"
        placeholder="Search nodes..."
        clearable
        style="width: 220px"
        @update:value="(v: string) => selectionStore.setSearch(v)"
      />

      <div class="filter-group">
        <span class="filter-label">Type</span>
        <NCheckbox
          v-for="t in TYPE_OPTIONS"
          :key="t"
          :checked="selectionStore.typeFilter.includes(t)"
          @update:checked="() => selectionStore.toggleType(t)"
        >
          <span :style="{ color: TYPE_COLOR[t] }">●</span> {{ t }}
        </NCheckbox>
      </div>

      <div class="filter-group">
        <span class="filter-label">Scope</span>
        <NCheckbox
          v-for="s in SCOPE_OPTIONS"
          :key="s"
          :checked="selectionStore.scopeFilter.includes(s)"
          @update:checked="() => selectionStore.toggleScope(s)"
        >
          {{ s }}
        </NCheckbox>
      </div>

      <NTooltip>
        <template #trigger>
          <NButton size="small" tertiary @click="selectionStore.resetFilters()">Reset</NButton>
        </template>
        Clear search and re-enable all filters
      </NTooltip>
    </div>

    <div class="canvas-wrap">
      <div ref="containerRef" class="graph-canvas" />
      <div v-if="loading" class="overlay"><NSpin /></div>
      <div v-else-if="!data || !data.nodes.length" class="overlay">
        <NEmpty description="No graph yet — add a project and scan it" />
      </div>
      <div v-else-if="!filteredGraph.nodes.length" class="overlay">
        <NEmpty description="No nodes match the current filters" />
      </div>
    </div>
  </NCard>
</template>

<style scoped>
.view-card {
  background: rgba(15, 22, 38, 0.65);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(110, 231, 255, 0.12);
}
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  padding: 0 0 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 14px;
}
.filter-group {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 12px;
  border-radius: 8px;
  background: rgba(110, 231, 255, 0.04);
  border: 1px solid rgba(110, 231, 255, 0.1);
}
.filter-label {
  font-size: 11px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.canvas-wrap {
  position: relative;
  width: 100%;
  height: calc(100vh - 280px);
  min-height: 480px;
}
.graph-canvas {
  position: absolute;
  inset: 0;
}
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
</style>
