<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { NCard, NSpace, NTag, NButton } from 'naive-ui';
import { useProjectStore } from '@/stores/project';

const projectStore = useProjectStore();

onMounted(() => projectStore.refresh());

const totals = computed(() => {
  let resources = 0;
  let events = 0;
  for (const p of projectStore.projects) {
    resources += p._count?.resources ?? 0;
    events += p._count?.events ?? 0;
  }
  return { projects: projectStore.projects.length, resources, events };
});

const stack = [
  { name: 'TypeScript', color: '#3178c6' },
  { name: 'Node 20', color: '#5fa04e' },
  { name: 'Express', color: '#fde047' },
  { name: 'Prisma', color: '#5a67d8' },
  { name: 'PostgreSQL 15', color: '#336791' },
  { name: 'Vue 3', color: '#42b883' },
  { name: 'Vite', color: '#646cff' },
  { name: 'Pinia', color: '#fdc02b' },
  { name: 'Naive UI', color: '#18a058' },
  { name: 'AntV G6 v5', color: '#1890ff' },
  { name: 'pnpm workspaces', color: '#f69220' },
  { name: 'Docker / Podman', color: '#0db7ed' },
];

const adapters = [
  { id: 'claude-code', name: 'Claude Code', status: 'stable' },
  { id: 'cursor', name: 'Cursor', status: 'planned' },
  { id: 'cline', name: 'Cline', status: 'planned' },
  { id: 'opencode', name: 'OpenCode', status: 'planned' },
  { id: 'gemini-cli', name: 'Gemini CLI', status: 'planned' },
];
</script>

<template>
  <div class="about-view">
    <div class="hero">
      <div class="brand-mark">⌬</div>
      <h1 class="brand-name">AgentFlow</h1>
      <p class="tagline">
        Local web dashboard to visualize how AI agent <strong>skills</strong>,
        <strong>subagents</strong>, <strong>commands</strong>, and <strong>hooks</strong> are wired
        together and triggered at runtime.
      </p>
      <NSpace size="small">
        <NTag size="small" :bordered="false" :color="{ color: '#6ee7ff22', textColor: '#6ee7ff' }">
          v0.1.0
        </NTag>
        <NTag size="small" :bordered="false" :color="{ color: '#a06bff22', textColor: '#a06bff' }">
          MVP
        </NTag>
      </NSpace>
    </div>

    <div class="grid">
      <NCard title="At a glance" class="info-card" :bordered="false">
        <div class="stats">
          <div class="stat">
            <div class="num">{{ totals.projects }}</div>
            <div class="label">Projects</div>
          </div>
          <div class="stat">
            <div class="num">{{ totals.resources }}</div>
            <div class="label">Resources</div>
          </div>
          <div class="stat">
            <div class="num">{{ totals.events }}</div>
            <div class="label">Events</div>
          </div>
        </div>
      </NCard>

      <NCard title="What it does" class="info-card" :bordered="false">
        <ul class="feature-list">
          <li>
            <span class="dot" style="background:#6ee7ff" />
            <strong>Static Flowchart</strong> — force-directed graph of every skill, subagent, command and hook
          </li>
          <li>
            <span class="dot" style="background:#a06bff" />
            <strong>Runtime Timeline</strong> — real events captured via injected hooks
          </li>
          <li>
            <span class="dot" style="background:#fde047" />
            <strong>Session Replay</strong> — scrub through time to watch nodes light up
          </li>
          <li>
            <span class="dot" style="background:#4ade80" />
            <strong>Cross-view Linking</strong> — pin a node, see only its events
          </li>
        </ul>
      </NCard>

      <NCard title="Tech stack" class="info-card" :bordered="false">
        <NSpace size="small">
          <NTag
            v-for="t in stack"
            :key="t.name"
            size="small"
            :bordered="false"
            :color="{ color: t.color + '22', textColor: t.color }"
          >
            {{ t.name }}
          </NTag>
        </NSpace>
      </NCard>

      <NCard title="Adapters" class="info-card" :bordered="false">
        <ul class="adapter-list">
          <li v-for="a in adapters" :key="a.id">
            <span class="adapter-name">{{ a.name }}</span>
            <NTag
              size="tiny"
              :bordered="false"
              :color="a.status === 'stable'
                ? { color: '#4ade8022', textColor: '#4ade80' }
                : { color: '#94a3b822', textColor: '#94a3b8' }"
            >
              {{ a.status }}
            </NTag>
          </li>
        </ul>
      </NCard>

      <NCard title="Documentation" class="info-card info-card-wide" :bordered="false">
        <p class="muted no-margin-top">
          Architecture, adapter interface, and JSONL event schema live under
          <code>docs/</code> in the repo.
        </p>
        <NSpace size="small" style="margin-top: 12px">
          <NButton tag="a" href="docs/architecture.md" target="_blank" size="small" tertiary>
            Architecture
          </NButton>
          <NButton tag="a" href="docs/agent-adapter.md" target="_blank" size="small" tertiary>
            Adapter Interface
          </NButton>
          <NButton tag="a" href="docs/event-schema.md" target="_blank" size="small" tertiary>
            Event Schema
          </NButton>
        </NSpace>
      </NCard>
    </div>

    <p class="footer">
      Built as a personal tool — open source soon. ⌬ AgentFlow is not affiliated with Anthropic.
    </p>
  </div>
</template>

<style scoped>
.about-view {
  max-width: 1100px;
  margin: 0 auto;
  padding: 8px 0 64px;
}
.hero {
  text-align: center;
  padding: 36px 12px 32px;
}
.brand-mark {
  font-size: 56px;
  background: linear-gradient(120deg, #6ee7ff, #a06bff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  line-height: 1;
}
.brand-name {
  margin: 8px 0 12px;
  font-size: 36px;
  font-weight: 700;
  background: linear-gradient(120deg, #6ee7ff, #a06bff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.tagline {
  max-width: 640px;
  margin: 0 auto 18px;
  color: #c8d2e6;
  line-height: 1.6;
  font-size: 15px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 16px;
}
.info-card {
  background: rgba(15, 22, 38, 0.6);
  border: 1px solid rgba(110, 231, 255, 0.12);
  backdrop-filter: blur(8px);
}
.info-card-wide {
  grid-column: 1 / -1;
}
.stats {
  display: flex;
  justify-content: space-around;
  gap: 18px;
}
.stat {
  text-align: center;
}
.stat .num {
  font-size: 32px;
  font-weight: 700;
  background: linear-gradient(120deg, #6ee7ff, #a06bff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.stat .label {
  font-size: 11px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-top: 4px;
}
.feature-list,
.adapter-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.feature-list li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  color: #c8d2e6;
  font-size: 13px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.feature-list li:last-child { border-bottom: none; }
.feature-list .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}
.adapter-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.adapter-list li:last-child { border-bottom: none; }
.adapter-name {
  color: #e6ecf7;
  font-size: 13px;
}
.muted {
  margin: 14px 0 0;
  color: #94a3b8;
  font-size: 12px;
}
.muted code {
  background: rgba(110, 231, 255, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
  color: #6ee7ff;
}
.footer {
  margin-top: 36px;
  text-align: center;
  color: #64748b;
  font-size: 12px;
}
</style>
