<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NTree, NEmpty, NSpin, type TreeOption } from 'naive-ui';
import { ResourcesApi, type ResourceDTO } from '@/api/client';
import { useProjectStore } from '@/stores/project';
import { useSelectionStore } from '@/stores/selection';

const projectStore = useProjectStore();
const selectionStore = useSelectionStore();
const loading = ref(false);
const resources = ref<ResourceDTO[]>([]);

watch(
  () => projectStore.currentId,
  async (id) => {
    if (!id) return;
    loading.value = true;
    try {
      resources.value = await ResourcesApi.list(id);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const treeData = computed<TreeOption[]>(() => {
  const groups: Record<string, ResourceDTO[]> = {
    skill: [], agent: [], command: [], hook: [], tool: [],
  };
  for (const r of resources.value) groups[r.type]?.push(r);

  return (Object.entries(groups) as [keyof typeof groups, ResourceDTO[]][])
    .filter(([, items]) => items.length > 0)
    .map(([type, items]) => ({
      key: `__group_${type}`,
      label: `${type.toUpperCase()}  ·  ${items.length}`,
      children: items.map((r) => ({
        key: r.id,
        label: r.name,
        isLeaf: true,
      })),
    }));
});

function onTreeUpdate(_keys: string[], _opts: Array<TreeOption | null>, meta: { node: TreeOption | null; action: string }) {
  const node = meta.node;
  if (!node || typeof node.key !== 'string') return;
  if (node.key.startsWith('__group_')) return;
  selectionStore.selectResource(node.key);
}
</script>

<template>
  <div class="file-tree">
    <NSpin v-if="loading" />
    <NEmpty v-else-if="!resources.length" description="No project selected" />
    <NTree
      v-else
      :data="treeData"
      block-line
      expand-on-click
      :default-expand-all="true"
      :selected-keys="selectionStore.selection?.kind === 'resource' ? [selectionStore.selection.id] : []"
      @update:selected-keys="onTreeUpdate"
    />
  </div>
</template>

<style scoped>
.file-tree {
  padding: 16px 12px;
  height: 100%;
}
</style>
