<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  NCard, NEmpty, NSpin, NSpace, NButton, NInput, NCheckbox, NSlider, NSelect, NTag,
} from 'naive-ui';
import { TreeApi, type SessionTraceDTO, type CallSpanDTO } from '@/api/client';
import { useProjectStore } from '@/stores/project';
import { useSelectionStore } from '@/stores/selection';

type SpanTypeKey = CallSpanDTO['type'];

const projectStore = useProjectStore();
const selectionStore = useSelectionStore();

const loading = ref(false);
const traces = ref<SessionTraceDTO[]>([]);
const selectedSessionId = ref<string | null>(null);
const expanded = ref<Set<string>>(new Set());

const search = ref('');
const typeFilter = ref<Set<SpanTypeKey>>(new Set([
  'session', 'user_prompt', 'tool', 'agent', 'skill', 'command', 'hook', 'other',
]));
const minDurationMs = ref(0);
const sortMode = ref<'start' | 'duration'>('start');

const TYPE_COLOR: Record<string, string> = {
  session:     '#64748b',
  user_prompt: '#fde047',
  tool:        '#f472b6',
  agent:       '#a06bff',
  skill:       '#6ee7ff',
  command:     '#4ade80',
  hook:        '#fb923c',
  other:       '#94a3b8',
};

const TYPE_ICON: Record<string, string> = {
  session:     '◉',
  user_prompt: '✎',
  tool:        '⌘',
  agent:       '⎔',
  skill:       '✦',
  command:     '›_',
  hook:        '⚡',
  other:       '·',
};

const TYPE_OPTIONS: SpanTypeKey[] = ['user_prompt', 'tool', 'agent', 'skill', 'command', 'hook'];

async function load() {
  const id = projectStore.currentId;
  if (!id) return;
  loading.value = true;
  try {
    traces.value = await TreeApi.list(id);
    if (traces.value.length && !selectedSessionId.value) {
      selectedSessionId.value = traces.value[0]!.sessionId;
    }
  } finally {
    loading.value = false;
  }
}

watch(() => projectStore.currentId, () => { traces.value = []; selectedSessionId.value = null; load(); });
onMounted(load);

const currentTrace = computed<SessionTraceDTO | null>(() =>
  traces.value.find((t) => t.sessionId === selectedSessionId.value) ?? null,
);

// ---------- heatmap ----------
const HEATMAP_BUCKETS = 60;
const heatmap = computed<number[]>(() => {
  if (!currentTrace.value) return [];
  const buckets = new Array(HEATMAP_BUCKETS).fill(0);
  const start = new Date(currentTrace.value.startTime).getTime();
  const end = new Date(currentTrace.value.endTime).getTime();
  const totalMs = Math.max(1, end - start);
  const stepMs = totalMs / HEATMAP_BUCKETS;
  const walk = (s: CallSpanDTO) => {
    if (s.type !== 'session' && s.durationMs != null) {
      const sStart = new Date(s.startTime).getTime();
      const sEnd = new Date(s.endTime ?? s.startTime).getTime();
      const startIdx = Math.max(0, Math.floor((sStart - start) / stepMs));
      const endIdx = Math.min(HEATMAP_BUCKETS - 1, Math.floor((sEnd - start) / stepMs));
      for (let i = startIdx; i <= endIdx; i++) buckets[i]++;
    }
    for (const c of s.children) walk(c);
  };
  walk(currentTrace.value.root);
  return buckets;
});
const heatmapMax = computed(() => Math.max(1, ...heatmap.value));

// ---------- ruler ----------
const rulerTicks = computed(() => {
  if (!currentTrace.value) return [];
  const total = currentTrace.value.durationMs || 1;
  const positions = [0, 0.25, 0.5, 0.75, 1];
  return positions.map((p) => ({
    left: p * 100,
    label: formatDuration(total * p),
  }));
});

// ---------- flatten + filter + sort ----------
interface FlatRow {
  span: CallSpanDTO;
  depth: number;
  visible: boolean;
  hasChildren: boolean;
  expanded: boolean;
  leftPct: number;
  widthPct: number;
  matched: boolean;
}

function flatten(trace: SessionTraceDTO): FlatRow[] {
  const rows: FlatRow[] = [];
  const totalMs = Math.max(1, trace.durationMs);
  const sessionStart = new Date(trace.startTime).getTime();

  const walk = (span: CallSpanDTO, depth: number, parentVisible: boolean, parentExpanded: boolean) => {
    const visible = parentVisible && parentExpanded;
    const start = new Date(span.startTime).getTime();
    const dur = span.durationMs ?? 0;
    const leftPct = ((start - sessionStart) / totalMs) * 100;
    const widthPct = Math.max(0.5, (dur / totalMs) * 100);
    const isExpanded = expanded.value.has(span.id);
    rows.push({
      span, depth, visible,
      hasChildren: span.children.length > 0,
      expanded: isExpanded,
      leftPct, widthPct,
      matched: true,
    });
    for (const c of span.children) walk(c, depth + 1, visible, isExpanded);
  };

  if (!expanded.value.has(trace.root.id)) expanded.value.add(trace.root.id);
  walk(trace.root, 0, true, true);
  return rows;
}

const isFiltering = computed(
  () => search.value.trim().length > 0 || minDurationMs.value > 0 || typeFilter.value.size < TYPE_OPTIONS.length,
);

function matches(span: CallSpanDTO): boolean {
  if (span.type === 'session') return true; // always keep root for context
  const q = search.value.trim().toLowerCase();
  if (q && !span.name.toLowerCase().includes(q)) return false;
  if (!typeFilter.value.has(span.type)) return false;
  if (minDurationMs.value > 0 && (span.durationMs ?? 0) < minDurationMs.value) return false;
  return true;
}

const filteredRows = computed<FlatRow[]>(() => {
  if (!currentTrace.value) return [];
  const all = flatten(currentTrace.value);

  if (!isFiltering.value) {
    return all.filter((r) => r.visible);
  }

  // In filter mode: flat list of matches (+ root for context), sorted.
  const hits = all.filter((r) => matches(r.span));
  if (sortMode.value === 'duration') {
    hits.sort((a, b) => (b.span.durationMs ?? 0) - (a.span.durationMs ?? 0));
  }
  // Reassign depth to 0 / 1 in flat mode (root + children) so indent is sane
  return hits.map((r, i) => ({
    ...r,
    depth: r.span.type === 'session' ? 0 : 1,
    visible: true,
    expanded: true,
    hasChildren: false,
  }));
});

const stats = computed(() => {
  if (!currentTrace.value) return { total: 0, shown: 0 };
  const all = flatten(currentTrace.value);
  return { total: all.length - 1, shown: filteredRows.value.filter((r) => r.span.type !== 'session').length };
});

// ---------- actions ----------
function toggle(span: CallSpanDTO) {
  if (expanded.value.has(span.id)) expanded.value.delete(span.id);
  else expanded.value.add(span.id);
  expanded.value = new Set(expanded.value);
}
function expandAll() {
  if (!currentTrace.value) return;
  const all = new Set<string>();
  const walk = (s: CallSpanDTO) => { all.add(s.id); for (const c of s.children) walk(c); };
  walk(currentTrace.value.root);
  expanded.value = all;
}
function collapseAll() {
  if (!currentTrace.value) return;
  expanded.value = new Set([currentTrace.value.root.id]);
}
function toggleType(t: SpanTypeKey) {
  const s = new Set(typeFilter.value);
  if (s.has(t)) s.delete(t); else s.add(t);
  typeFilter.value = s;
}
function resetFilters() {
  search.value = '';
  typeFilter.value = new Set(['session', ...TYPE_OPTIONS]);
  minDurationMs.value = 0;
  sortMode.value = 'start';
}
function onSpanClick(span: CallSpanDTO) {
  if (span.resourceId) selectionStore.selectResource(span.resourceId);
}

// ---------- formatters ----------
function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
function formatSessionTime(ts: string): string {
  return new Date(ts).toLocaleString();
}

const sortOptions = [
  { label: 'Start time', value: 'start' },
  { label: 'Duration ↓', value: 'duration' },
];
</script>

<template>
  <div class="trace-view">
    <aside class="sessions">
      <div class="sessions-header">Sessions</div>
      <NSpin v-if="loading && !traces.length" size="small" />
      <NEmpty v-else-if="!traces.length" size="small" description="No sessions yet" />
      <ul v-else class="session-list">
        <li
          v-for="t in traces"
          :key="t.sessionId"
          class="session-item"
          :class="{ 'is-active': t.sessionId === selectedSessionId }"
          @click="selectedSessionId = t.sessionId"
        >
          <div class="sess-id">{{ t.sessionId.slice(0, 24) }}</div>
          <div class="sess-meta">
            <span class="sess-count">{{ t.eventCount }} events</span>
            <span class="sess-dur">{{ formatDuration(t.durationMs) }}</span>
          </div>
          <div class="sess-time">{{ formatSessionTime(t.startTime) }}</div>
        </li>
      </ul>
    </aside>

    <NCard title="Call Tree" class="view-card" :bordered="false">
      <template #header-extra>
        <NSpace size="small">
          <NTag size="small" :bordered="false" :color="{ color: '#6ee7ff15', textColor: '#94a3b8' }">
            {{ stats.shown }} / {{ stats.total }}
          </NTag>
          <NButton size="tiny" tertiary @click="expandAll">Expand all</NButton>
          <NButton size="tiny" tertiary @click="collapseAll">Collapse</NButton>
        </NSpace>
      </template>

      <!-- Toolbar -->
      <div class="toolbar">
        <NInput
          v-model:value="search"
          size="small"
          placeholder="Search spans by name..."
          clearable
          style="width: 240px"
        />
        <div class="filter-group">
          <span class="filter-label">Type</span>
          <NCheckbox
            v-for="t in TYPE_OPTIONS"
            :key="t"
            :checked="typeFilter.has(t)"
            @update:checked="() => toggleType(t)"
          >
            <span :style="{ color: TYPE_COLOR[t] }">●</span> {{ t }}
          </NCheckbox>
        </div>
        <div class="filter-group duration-filter">
          <span class="filter-label">Min duration</span>
          <span class="duration-value">{{ formatDuration(minDurationMs) }}</span>
          <NSlider
            v-model:value="minDurationMs"
            :min="0"
            :max="2000"
            :step="50"
            style="width: 140px"
          />
        </div>
        <NSelect
          v-model:value="sortMode"
          :options="sortOptions"
          size="small"
          style="width: 130px"
        />
        <NButton size="tiny" tertiary @click="resetFilters">Reset</NButton>
      </div>

      <NEmpty v-if="!currentTrace" description="Select a session on the left" />
      <template v-else>
        <!-- Ruler + Heatmap -->
        <div class="ruler-wrap">
          <div class="ruler-left">
            <span class="muted">{{ currentTrace.eventCount }} events · {{ formatDuration(currentTrace.durationMs) }}</span>
          </div>
          <div class="ruler">
            <div
              v-for="tick in rulerTicks"
              :key="tick.left"
              class="tick"
              :style="{ left: tick.left + '%' }"
            >
              <span class="tick-line" />
              <span class="tick-label">{{ tick.label }}</span>
            </div>
            <div class="heatmap">
              <div
                v-for="(n, i) in heatmap"
                :key="i"
                class="bucket"
                :style="{
                  left: (i / heatmap.length * 100) + '%',
                  width: (100 / heatmap.length) + '%',
                  height: (n / heatmapMax * 100) + '%',
                  opacity: 0.25 + (n / heatmapMax) * 0.55,
                }"
              />
            </div>
          </div>
        </div>

        <!-- Waterfall rows -->
        <div class="waterfall">
          <div
            v-for="row in filteredRows"
            :key="row.span.id"
            class="row"
            :class="{ 'is-open': row.span.open, 'is-session': row.span.type === 'session' }"
            @click="onSpanClick(row.span)"
          >
            <div class="row-left" :style="{ paddingLeft: (row.depth * 18) + 'px' }">
              <span
                v-if="row.hasChildren && !isFiltering"
                class="toggle"
                :class="{ 'is-expanded': row.expanded }"
                @click.stop="toggle(row.span)"
              >▸</span>
              <span v-else class="toggle toggle-blank">·</span>

              <span class="icon" :style="{ color: TYPE_COLOR[row.span.type] }">
                {{ TYPE_ICON[row.span.type] }}
              </span>

              <span class="name" :style="{ color: TYPE_COLOR[row.span.type] }">
                {{ row.span.name }}
              </span>

              <span class="durations">
                <span class="dur-total">{{ formatDuration(row.span.durationMs) }}</span>
                <span
                  v-if="
                    row.span.selfTimeMs != null &&
                    row.span.durationMs != null &&
                    row.span.selfTimeMs !== row.span.durationMs
                  "
                  class="dur-self"
                >
                  {{ formatDuration(row.span.selfTimeMs) }} self
                </span>
              </span>
            </div>

            <div class="row-bar">
              <!-- total bar -->
              <div
                class="bar"
                :style="{
                  left: row.leftPct + '%',
                  width: row.widthPct + '%',
                  background: TYPE_COLOR[row.span.type],
                }"
              >
                <!-- self-time slice overlaid -->
                <div
                  v-if="
                    row.span.selfTimeMs != null &&
                    row.span.durationMs != null &&
                    row.span.durationMs > 0
                  "
                  class="bar-self"
                  :style="{
                    width: (row.span.selfTimeMs / row.span.durationMs * 100) + '%',
                    background: TYPE_COLOR[row.span.type],
                  }"
                />
              </div>
            </div>
          </div>
        </div>
      </template>
    </NCard>
  </div>
</template>

<style scoped>
.trace-view {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  min-height: calc(100vh - 180px);
}

.sessions {
  background: rgba(15, 22, 38, 0.65);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(110, 231, 255, 0.12);
  border-radius: 8px;
  padding: 12px;
  overflow-y: auto;
  max-height: calc(100vh - 180px);
}
.sessions-header {
  font-size: 11px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  padding: 4px 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 8px;
}
.session-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.session-item {
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, transform 0.12s;
  margin-bottom: 4px;
  border: 1px solid transparent;
}
.session-item:hover { background: rgba(110, 231, 255, 0.05); }
.session-item.is-active {
  background: linear-gradient(135deg, rgba(110, 231, 255, 0.12), rgba(160, 107, 255, 0.12));
  border-color: rgba(160, 107, 255, 0.4);
  box-shadow: 0 0 0 1px rgba(160, 107, 255, 0.25);
}
.sess-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #e6ecf7;
  font-weight: 500;
}
.sess-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 11px;
}
.sess-count { color: #6ee7ff; }
.sess-dur { color: #a06bff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.sess-time { margin-top: 4px; font-size: 10px; color: #64748b; }

.view-card {
  background: rgba(15, 22, 38, 0.65);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(110, 231, 255, 0.12);
}

/* Toolbar */
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding-bottom: 14px;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(110, 231, 255, 0.04);
  border: 1px solid rgba(110, 231, 255, 0.1);
}
.filter-label {
  font-size: 10px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.duration-filter .duration-value {
  min-width: 44px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: #a06bff;
}

/* Ruler + heatmap */
.ruler-wrap {
  display: grid;
  grid-template-columns: minmax(320px, 40%) 1fr;
  align-items: flex-end;
  height: 56px;
  padding-bottom: 8px;
  margin-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.ruler-left {
  padding: 0 8px;
  font-size: 11px;
}
.muted {
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.ruler {
  position: relative;
  height: 52px;
}
.tick {
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
}
.tick-line {
  position: absolute;
  top: 16px;
  bottom: 0;
  width: 1px;
  background: rgba(110, 231, 255, 0.15);
}
.tick-label {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: 10px;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap;
}

.heatmap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 32px;
}
.bucket {
  position: absolute;
  bottom: 0;
  background: linear-gradient(180deg, #6ee7ff, #a06bff);
  border-radius: 1px;
  min-height: 2px;
}

/* Waterfall */
.waterfall {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.row {
  display: grid;
  grid-template-columns: minmax(320px, 40%) 1fr;
  align-items: center;
  height: 28px;
  padding: 0 8px;
  background: rgba(255, 255, 255, 0.015);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s;
}
.row:hover { background: rgba(110, 231, 255, 0.06); }
.row.is-open { border-left: 2px solid #fde047; }
.row.is-session {
  background: rgba(100, 116, 139, 0.08);
  font-weight: 600;
}
.row-left {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  white-space: nowrap;
}
.toggle {
  display: inline-block;
  width: 14px;
  text-align: center;
  color: #94a3b8;
  font-size: 10px;
  transition: transform 0.12s;
  cursor: pointer;
  user-select: none;
}
.toggle.is-expanded { transform: rotate(90deg); }
.toggle-blank { opacity: 0.3; cursor: default; }
.icon { font-size: 13px; width: 14px; text-align: center; display: inline-block; }
.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}
.durations {
  display: inline-flex;
  gap: 8px;
  align-items: baseline;
  margin-left: auto;
  padding-left: 12px;
  white-space: nowrap;
}
.dur-total { color: #e6ecf7; font-size: 11px; }
.dur-self {
  color: #94a3b8;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(160, 107, 255, 0.1);
  border: 1px solid rgba(160, 107, 255, 0.2);
}

.row-bar {
  position: relative;
  height: 20px;
  background: rgba(255, 255, 255, 0.015);
  border-radius: 2px;
}
.bar {
  position: absolute;
  top: 4px;
  bottom: 4px;
  min-width: 2px;
  border-radius: 2px;
  opacity: 0.35;
  overflow: hidden;
}
.bar-self {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  opacity: 1;
  border-radius: 2px;
  box-shadow: 0 0 6px currentColor;
}
</style>
