<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  NCard,
  NEmpty,
  NSpin,
  NButton,
  NTag,
  NSpace,
  NPopconfirm,
  NModal,
  NInput,
  NForm,
  NFormItem,
  NCheckbox,
  useMessage,
} from 'naive-ui';
import { useProjectStore } from '@/stores/project';
import type { Project } from '@/api/client';

const projectStore = useProjectStore();
const router = useRouter();
const message = useMessage();

const showAdd = ref(false);
const adding = ref(false);
const newPath = ref('');
const newName = ref('');
const autoInstrument = ref(true);

onMounted(() => projectStore.refresh());

async function submitAdd() {
  if (!newPath.value.trim()) {
    message.warning('Please enter a project path');
    return;
  }
  adding.value = true;
  try {
    await projectStore.addProject(
      newPath.value.trim(),
      newName.value.trim() || undefined,
      autoInstrument.value,
    );
    message.success(
      autoInstrument.value
        ? 'Project added, scanned, and hooks installed'
        : 'Project added and scanned',
    );
    showAdd.value = false;
    newPath.value = '';
    newName.value = '';
    autoInstrument.value = true;
  } catch (err) {
    message.error((err as Error).message);
  } finally {
    adding.value = false;
  }
}

function openProject(p: Project) {
  projectStore.select(p.id);
  router.push('/flowchart');
}

async function rescan(p: Project) {
  try {
    await projectStore.rescan(p.id);
    message.success(`Re-scanned ${p.name}`);
  } catch (err) {
    message.error((err as Error).message);
  }
}

async function remove(p: Project) {
  try {
    await projectStore.removeProject(p.id);
    message.success(`Deleted ${p.name}`);
  } catch (err) {
    message.error((err as Error).message);
  }
}

function fmtDate(s?: string) {
  if (!s) return '—';
  return new Date(s).toLocaleString();
}
</script>

<template>
  <div class="projects-view">
    <div class="page-header">
      <div>
        <h1 class="title">Projects</h1>
        <p class="subtitle">Pick a project to inspect, or add a new one.</p>
      </div>
      <NButton type="primary" size="medium" @click="showAdd = true">+ Add Project</NButton>
    </div>

    <NSpin v-if="projectStore.loading && !projectStore.projects.length" />

    <div v-else-if="!projectStore.projects.length" class="empty-wrap">
      <NEmpty size="huge" description="No projects yet">
        <template #extra>
          <NButton type="primary" @click="showAdd = true">Add your first project</NButton>
        </template>
      </NEmpty>
    </div>

    <div v-else class="grid">
      <NCard
        v-for="p in projectStore.projects"
        :key="p.id"
        class="project-card"
        :class="{ 'is-current': p.id === projectStore.currentId }"
        :bordered="false"
      >
        <template #header>
          <div class="card-title">
            <span class="dot" />
            <span class="name">{{ p.name }}</span>
            <NTag size="tiny" :bordered="false" :color="{ color: '#6ee7ff22', textColor: '#6ee7ff' }">
              {{ p.adapterId }}
            </NTag>
          </div>
        </template>

        <p class="path">{{ p.rootPath }}</p>

        <div class="stats">
          <div class="stat">
            <span class="stat-num">{{ p._count?.resources ?? 0 }}</span>
            <span class="stat-label">resources</span>
          </div>
          <div class="stat">
            <span class="stat-num">{{ p._count?.events ?? 0 }}</span>
            <span class="stat-label">events</span>
          </div>
        </div>

        <p class="meta">Updated {{ fmtDate(p.updatedAt) }}</p>

        <template #action>
          <NSpace size="small" justify="space-between">
            <NSpace size="small">
              <NButton size="small" type="primary" @click="openProject(p)">Open</NButton>
              <NButton size="small" tertiary @click="rescan(p)">Rescan</NButton>
            </NSpace>
            <NPopconfirm @positive-click="remove(p)">
              <template #trigger>
                <NButton size="small" tertiary type="error">Delete</NButton>
              </template>
              Delete <strong>{{ p.name }}</strong> and all its events?
            </NPopconfirm>
          </NSpace>
        </template>
      </NCard>
    </div>

    <NModal
      v-model:show="showAdd"
      preset="card"
      style="width: 540px; max-width: 90vw"
      title="Add a project"
      :auto-focus="false"
    >
      <NForm label-placement="top" require-mark-placement="left">
        <NFormItem label="Project root path" required>
          <NInput
            v-model:value="newPath"
            placeholder="/absolute/path/to/your/project"
            clearable
          />
        </NFormItem>
        <NFormItem label="Display name (optional)">
          <NInput v-model:value="newName" placeholder="Auto-derived from path if empty" clearable />
        </NFormItem>
        <NFormItem>
          <NCheckbox v-model:checked="autoInstrument">
            Install hook instrumentation now
          </NCheckbox>
          <p class="hint">
            Writes <code>.agentflow/hook-forwarder.mjs</code> and patches
            <code>.claude/settings.json</code> so events are captured automatically.
            Restart your Claude Code session for hooks to take effect.
          </p>
        </NFormItem>
      </NForm>
      <template #action>
        <NSpace justify="end">
          <NButton @click="showAdd = false">Cancel</NButton>
          <NButton type="primary" :loading="adding" @click="submitAdd">Add &amp; scan</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.projects-view {
  padding: 8px 4px;
}
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
}
.title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  background: linear-gradient(120deg, #6ee7ff, #a06bff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.subtitle {
  margin: 4px 0 0;
  color: #94a3b8;
  font-size: 13px;
}
.empty-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 18px;
}
.project-card {
  background: rgba(15, 22, 38, 0.7);
  border: 1px solid rgba(110, 231, 255, 0.12);
  backdrop-filter: blur(8px);
  transition: border 0.18s, transform 0.18s;
}
.project-card:hover {
  border-color: rgba(110, 231, 255, 0.35);
  transform: translateY(-2px);
}
.project-card.is-current {
  border-color: rgba(160, 107, 255, 0.55);
  box-shadow: 0 0 0 1px rgba(160, 107, 255, 0.25), 0 0 24px rgba(160, 107, 255, 0.18);
}
.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(120deg, #6ee7ff, #a06bff);
}
.name {
  font-weight: 600;
  font-size: 15px;
  color: #e6ecf7;
}
.path {
  margin: 0 0 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: #6ee7ff;
  word-break: break-all;
  opacity: 0.75;
}
.stats {
  display: flex;
  gap: 24px;
  padding: 12px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stat-num {
  font-size: 22px;
  font-weight: 600;
  color: #e6ecf7;
}
.stat-label {
  font-size: 11px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.meta {
  margin: 12px 0 0;
  font-size: 11px;
  color: #64748b;
}
.hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.5;
}
.hint code {
  background: rgba(110, 231, 255, 0.1);
  padding: 1px 5px;
  border-radius: 3px;
  color: #6ee7ff;
  font-size: 10px;
}
</style>
