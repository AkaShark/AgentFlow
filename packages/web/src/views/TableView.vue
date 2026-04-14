<script setup lang="ts">
import { h, ref, watch } from 'vue';
import { NCard, NDataTable, NTag, NButton, type DataTableColumns } from 'naive-ui';
import { ResourcesApi, type ResourceDTO } from '@/api/client';
import { useProjectStore } from '@/stores/project';
import { useSelectionStore } from '@/stores/selection';

const projectStore = useProjectStore();
const selectionStore = useSelectionStore();
const data = ref<ResourceDTO[]>([]);

watch(
  () => projectStore.currentId,
  async (id) => { if (id) data.value = await ResourcesApi.list(id); },
  { immediate: true },
);

const TYPE_TAG: Record<string, 'info' | 'success' | 'warning' | 'error' | 'primary'> = {
  skill: 'info', agent: 'success', command: 'warning', hook: 'error', tool: 'primary',
};

const columns: DataTableColumns<ResourceDTO> = [
  {
    title: 'Type', key: 'type', width: 110,
    render: (row) =>
      h(NTag, { size: 'small', type: TYPE_TAG[row.type] ?? 'default' }, { default: () => row.type }),
  },
  { title: 'Name', key: 'name', width: 220 },
  { title: 'Description', key: 'description', ellipsis: { tooltip: true } },
  {
    title: 'Triggered', key: '_count.events', width: 120,
    sorter: (a, b) => (a._count?.events ?? 0) - (b._count?.events ?? 0),
    render: (row) => row._count?.events ?? 0,
  },
  {
    title: '', key: 'actions', width: 80,
    render: (row) =>
      h(
        NButton,
        { size: 'tiny', tertiary: true, onClick: () => selectionStore.selectResource(row.id) },
        { default: () => 'View' },
      ),
  },
];
</script>

<template>
  <NCard title="Resources" class="view-card" :bordered="false">
    <NDataTable :columns="columns" :data="data" :bordered="false" striped />
  </NCard>
</template>

<style scoped>
.view-card {
  background: rgba(15, 22, 38, 0.65);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(110, 231, 255, 0.12);
}
</style>
