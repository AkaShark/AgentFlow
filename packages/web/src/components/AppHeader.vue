<script setup lang="ts">
import { computed, h, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NSelect, NButton, NTag, useMessage } from 'naive-ui';
import { useProjectStore } from '@/stores/project';
import InstrumentModal from './InstrumentModal.vue';

const projectStore = useProjectStore();
const route = useRoute();
const router = useRouter();
const message = useMessage();
const showInstrument = ref(false);

const projectOptions = computed(() =>
  projectStore.projects.map((p) => ({ label: p.name, value: p.id })),
);

interface NavItem {
  key: string;
  label: string;
  icon: string;
  to: string;
  needsProject: boolean;
}

const navItems: NavItem[] = [
  { key: 'projects',  label: 'Projects',  icon: '◉', to: '/projects',  needsProject: false },
  { key: 'flowchart', label: 'Flowchart', icon: '⌬', to: '/flowchart', needsProject: true },
  { key: 'timeline',  label: 'Timeline',  icon: '◷', to: '/timeline',  needsProject: true },
  { key: 'table',     label: 'Table',     icon: '☷', to: '/table',     needsProject: true },
  { key: 'about',     label: 'About',     icon: '✦', to: '/about',     needsProject: false },
];

function isActive(item: NavItem): boolean {
  const path = route.path === '/' ? '/projects' : route.path;
  return path === item.to;
}

function go(item: NavItem) {
  if (item.needsProject && !projectStore.currentId) return;
  router.push(item.to);
}

function onSelectProject(id: string) {
  projectStore.select(id);
}

function quickInstall() {
  if (!projectStore.currentId) {
    message.warning('Pick a project first');
    return;
  }
  showInstrument.value = true;
}
</script>

<template>
  <div class="header-content">
    <div class="brand" @click="router.push('/projects')">
      <span class="brand-mark">⌬</span>
      <span class="brand-name">AgentFlow</span>
    </div>

    <nav class="nav">
      <button
        v-for="item in navItems"
        :key="item.key"
        class="nav-item"
        :class="{
          'is-active': isActive(item),
          'is-disabled': item.needsProject && !projectStore.currentId,
        }"
        :disabled="item.needsProject && !projectStore.currentId"
        @click="go(item)"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span class="nav-label">{{ item.label }}</span>
        <span v-if="isActive(item)" class="nav-glow" />
      </button>
    </nav>

    <div class="right">
      <div class="project-picker">
        <span class="picker-label">Project</span>
        <NSelect
          :value="projectStore.currentId"
          :options="projectOptions"
          placeholder="Pick a project"
          size="small"
          style="width: 220px"
          :consistent-menu-width="false"
          @update:value="onSelectProject"
        />
        <NTag
          v-if="projectStore.current"
          size="small"
          :bordered="false"
          :color="{ color: '#6ee7ff22', textColor: '#6ee7ff' }"
        >
          {{ projectStore.current.adapterId }}
        </NTag>
      </div>
      <NButton
        size="small"
        :disabled="!projectStore.currentId"
        @click="quickInstall"
      >
        Install Hooks
      </NButton>
    </div>

    <InstrumentModal
      v-model:show="showInstrument"
      :project-id="projectStore.currentId"
    />
  </div>
</template>

<style scoped>
.header-content {
  display: flex;
  align-items: center;
  gap: 24px;
  width: 100%;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 17px;
  background: linear-gradient(120deg, #6ee7ff, #a06bff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  cursor: pointer;
  user-select: none;
  padding-right: 12px;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  letter-spacing: 0.02em;
}
.brand-mark {
  font-size: 22px;
  filter: drop-shadow(0 0 8px rgba(110, 231, 255, 0.4));
}

.nav {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: rgba(13, 19, 32, 0.6);
  border: 1px solid rgba(110, 231, 255, 0.08);
  backdrop-filter: blur(10px);
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: none;
  background: transparent;
  color: #94a3b8;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: color 0.18s, background 0.18s, transform 0.12s;
  user-select: none;
  white-space: nowrap;
}
.nav-item:hover:not(.is-disabled):not(.is-active) {
  color: #e6ecf7;
  background: rgba(110, 231, 255, 0.06);
}
.nav-item:active:not(.is-disabled) {
  transform: scale(0.97);
}
.nav-item.is-disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.nav-item.is-active {
  color: #0b1020;
  background: linear-gradient(120deg, #6ee7ff, #a06bff);
  box-shadow:
    0 4px 14px rgba(110, 231, 255, 0.28),
    0 0 0 1px rgba(160, 107, 255, 0.4) inset;
}
.nav-item.is-active .nav-icon { color: #0b1020; }

.nav-icon {
  font-size: 14px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
}
.nav-label { font-size: 12.5px; }

.nav-glow {
  position: absolute;
  inset: -4px;
  border-radius: 12px;
  pointer-events: none;
  background: radial-gradient(closest-side, rgba(110, 231, 255, 0.35), transparent 70%);
  filter: blur(10px);
  z-index: -1;
}

.right {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}
.project-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-radius: 10px;
  background: rgba(110, 231, 255, 0.05);
  border: 1px solid rgba(110, 231, 255, 0.12);
}
.picker-label {
  font-size: 10px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}
</style>
