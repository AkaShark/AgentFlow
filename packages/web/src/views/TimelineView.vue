<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  NCard, NEmpty, NSpin, NTag, NButton, NSlider, NSpace, NTooltip, NIcon,
} from 'naive-ui';
import { EventsApi, connectEventStream, type EventDTO } from '@/api/client';
import { useProjectStore } from '@/stores/project';
import { useSelectionStore } from '@/stores/selection';

const projectStore = useProjectStore();
const selectionStore = useSelectionStore();
const loading = ref(false);
const events = ref<EventDTO[]>([]);
let ws: WebSocket | null = null;
let playInterval: number | null = null;

async function load() {
  const id = projectStore.currentId;
  if (!id) return;
  loading.value = true;
  try {
    events.value = await EventsApi.list(id, {
      limit: 1000,
      resourceId: selectionStore.pinnedResourceId ?? undefined,
    });
  } finally {
    loading.value = false;
  }
}

watch(() => projectStore.currentId, () => load(), { immediate: false });
watch(() => selectionStore.pinnedResourceId, () => load());

onMounted(() => {
  load();
  ws = connectEventStream((event) => {
    if (event.projectId !== projectStore.currentId) return;
    if (selectionStore.pinnedResourceId && event.resourceId !== selectionStore.pinnedResourceId) return;
    events.value.unshift(event);
    if (events.value.length > 1000) events.value.pop();
  });
});

onUnmounted(() => {
  ws?.close();
  if (playInterval) window.clearInterval(playInterval);
});

const tagType = (type: string) => {
  if (type.startsWith('tool')) return 'info';
  if (type.startsWith('agent')) return 'success';
  if (type.startsWith('skill')) return 'warning';
  if (type.startsWith('hook')) return 'error';
  if (type.startsWith('command')) return 'primary';
  return 'default';
};

// ---------- Replay ----------

const sortedAsc = computed(() => [...events.value].sort((a, b) =>
  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
));

const timeRange = computed(() => {
  if (!sortedAsc.value.length) return null;
  return {
    min: new Date(sortedAsc.value[0]!.timestamp).getTime(),
    max: new Date(sortedAsc.value[sortedAsc.value.length - 1]!.timestamp).getTime(),
  };
});

const sliderValue = computed({
  get: () => {
    if (!selectionStore.replayTimestamp) return timeRange.value?.max ?? 0;
    return new Date(selectionStore.replayTimestamp).getTime();
  },
  set: (v: number) => {
    selectionStore.setReplayTime(new Date(v).toISOString());
  },
});

function formatTime(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString();
}

function toggleReplay() {
  if (selectionStore.replayActive) {
    selectionStore.setReplay(false);
    if (playInterval) { window.clearInterval(playInterval); playInterval = null; }
    return;
  }
  selectionStore.setReplay(true);
  if (timeRange.value) sliderValue.value = timeRange.value.min;
}

function playPause() {
  if (playInterval) {
    window.clearInterval(playInterval);
    playInterval = null;
    return;
  }
  if (!timeRange.value) return;
  const totalMs = timeRange.value.max - timeRange.value.min;
  const stepMs = Math.max(50, totalMs / 200); // ~200 steps
  playInterval = window.setInterval(() => {
    if (!timeRange.value) return;
    const next = sliderValue.value + stepMs;
    if (next >= timeRange.value.max) {
      sliderValue.value = timeRange.value.max;
      window.clearInterval(playInterval!);
      playInterval = null;
      return;
    }
    sliderValue.value = next;
  }, 80);
}

// Compute "active" resources (those with events within ±window of replayTimestamp)
watch(
  () => [selectionStore.replayActive, selectionStore.replayTimestamp, events.value.length] as const,
  () => {
    if (!selectionStore.replayActive || !selectionStore.replayTimestamp) {
      selectionStore.setActiveResources([]);
      return;
    }
    const center = new Date(selectionStore.replayTimestamp).getTime();
    const win = selectionStore.replayWindowMs;
    const ids = new Set<string>();
    for (const e of events.value) {
      if (!e.resourceId) continue;
      const t = new Date(e.timestamp).getTime();
      if (Math.abs(t - center) <= win) ids.add(e.resourceId);
    }
    selectionStore.setActiveResources([...ids]);
  },
);

function clearPin() {
  selectionStore.pinResource(null);
}
</script>

<template>
  <NCard title="Runtime Timeline" class="view-card" :bordered="false">
    <template #header-extra>
      <NSpace size="small" align="center">
        <NTag
          v-if="selectionStore.pinnedResourceId"
          closable
          size="small"
          :color="{ color: '#a06bff22', textColor: '#a06bff', borderColor: '#a06bff55' }"
          @close="clearPin"
        >
          {{ selectionStore.pinnedResourceId.split(':').slice(-1)[0] }}
        </NTag>
        <NButton
          size="small"
          :type="selectionStore.replayActive ? 'primary' : 'default'"
          @click="toggleReplay"
        >
          {{ selectionStore.replayActive ? 'Exit Replay' : 'Replay' }}
        </NButton>
      </NSpace>
    </template>

    <div v-if="selectionStore.replayActive && timeRange" class="scrubber">
      <NSpace align="center" :size="12">
        <NButton size="small" @click="playPause">
          {{ playInterval ? '⏸' : '▶' }}
        </NButton>
        <span class="time-label">{{ formatTime(sliderValue) }}</span>
      </NSpace>
      <NSlider
        :value="sliderValue"
        :min="timeRange.min"
        :max="timeRange.max"
        :step="100"
        :format-tooltip="(v: number) => formatTime(v)"
        @update:value="(v: number) => (sliderValue = v)"
      />
      <div class="scrubber-axis">
        <span>{{ formatTime(timeRange.min) }}</span>
        <span class="hint">{{ selectionStore.activeResourceIds.length }} active</span>
        <span>{{ formatTime(timeRange.max) }}</span>
      </div>
    </div>

    <NSpin v-if="loading" />
    <NEmpty
      v-else-if="!events.length"
      description="No events yet — install hook instrumentation in your project"
    />
    <ul v-else class="timeline">
      <li
        v-for="e in events"
        :key="e.id"
        class="timeline-item"
        :class="{ 'is-active': selectionStore.activeResourceIds.includes(e.resourceId ?? '') }"
        @click="selectionStore.selectEvent(e)"
      >
        <span class="ts">{{ new Date(e.timestamp).toLocaleTimeString() }}</span>
        <NTag :type="tagType(e.type) as any" size="small">{{ e.type }}</NTag>
        <span class="rid">{{ e.resourceId ?? '—' }}</span>
        <span v-if="e.durationMs != null" class="dur">{{ e.durationMs }}ms</span>
      </li>
    </ul>
  </NCard>
</template>

<style scoped>
.view-card {
  background: rgba(15, 22, 38, 0.65);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(160, 107, 255, 0.12);
}
.scrubber {
  padding: 14px 16px;
  margin-bottom: 16px;
  border-radius: 8px;
  background: rgba(160, 107, 255, 0.06);
  border: 1px solid rgba(160, 107, 255, 0.18);
}
.time-label {
  color: #a06bff;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  font-weight: 600;
}
.scrubber-axis {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 11px;
  color: #94a3b8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.scrubber-axis .hint { color: #fde047; }
.timeline {
  list-style: none;
  padding: 0;
  margin: 0;
}
.timeline-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-left: 2px solid transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  color: #c8d2e6;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.timeline-item:hover {
  background: rgba(110, 231, 255, 0.06);
  border-left-color: #6ee7ff;
}
.timeline-item.is-active {
  background: rgba(253, 224, 71, 0.08);
  border-left-color: #fde047;
}
.ts { color: #6ee7ff; min-width: 90px; }
.rid { color: #94a3b8; flex: 1; word-break: break-all; }
.dur { color: #a06bff; }
</style>
