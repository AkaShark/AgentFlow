<script setup lang="ts">
import { computed } from 'vue';
import {
  NDrawer,
  NDrawerContent,
  NDescriptions,
  NDescriptionsItem,
  NTag,
  NCode,
  NSpin,
  NEmpty,
} from 'naive-ui';
import { useSelectionStore } from '@/stores/selection';

const selectionStore = useSelectionStore();

const isOpen = computed({
  get: () => selectionStore.isOpen,
  set: (v: boolean) => { if (!v) selectionStore.clear(); },
});

const title = computed(() => {
  if (selectionStore.selection?.kind === 'resource') {
    return selectionStore.currentResource?.name ?? 'Resource';
  }
  if (selectionStore.selection?.kind === 'event') {
    return selectionStore.currentEvent?.type ?? 'Event';
  }
  return 'Details';
});

const tagType = (t: string) => {
  const m: Record<string, string> = {
    skill: 'info', agent: 'success', command: 'warning', hook: 'error', tool: 'primary',
  };
  return m[t] ?? 'default';
};
</script>

<template>
  <NDrawer v-model:show="isOpen" :width="460" placement="right">
    <NDrawerContent :title="title" closable>
      <NSpin v-if="selectionStore.loading" />

      <!-- Resource detail -->
      <template v-else-if="selectionStore.currentResource">
        <NDescriptions :column="1" size="small" bordered label-placement="left">
          <NDescriptionsItem label="Type">
            <NTag :type="tagType(selectionStore.currentResource.type) as any" size="small">
              {{ selectionStore.currentResource.type }}
            </NTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="Name">{{ selectionStore.currentResource.name }}</NDescriptionsItem>
          <NDescriptionsItem label="Path">
            <code class="path">{{ selectionStore.currentResource.filePath }}</code>
          </NDescriptionsItem>
          <NDescriptionsItem v-if="selectionStore.currentResource.description" label="Description">
            {{ selectionStore.currentResource.description }}
          </NDescriptionsItem>
          <NDescriptionsItem label="Triggered">
            {{ selectionStore.currentResource._count?.events ?? 0 }} times
          </NDescriptionsItem>
        </NDescriptions>

        <h4 class="section">Metadata</h4>
        <NCode
          :code="JSON.stringify(selectionStore.currentResource.metadata, null, 2)"
          language="json"
          word-wrap
        />
      </template>

      <!-- Event detail -->
      <template v-else-if="selectionStore.currentEvent">
        <NDescriptions :column="1" size="small" bordered label-placement="left">
          <NDescriptionsItem label="Type">
            <NTag size="small">{{ selectionStore.currentEvent.type }}</NTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="Time">
            {{ new Date(selectionStore.currentEvent.timestamp).toLocaleString() }}
          </NDescriptionsItem>
          <NDescriptionsItem label="Session">
            <code>{{ selectionStore.currentEvent.sessionId }}</code>
          </NDescriptionsItem>
          <NDescriptionsItem v-if="selectionStore.currentEvent.resourceId" label="Resource">
            <code>{{ selectionStore.currentEvent.resourceId }}</code>
          </NDescriptionsItem>
          <NDescriptionsItem v-if="selectionStore.currentEvent.durationMs != null" label="Duration">
            {{ selectionStore.currentEvent.durationMs }} ms
          </NDescriptionsItem>
        </NDescriptions>

        <h4 class="section">Payload</h4>
        <NCode
          :code="JSON.stringify(selectionStore.currentEvent.payload, null, 2)"
          language="json"
          word-wrap
        />
      </template>

      <NEmpty v-else description="Nothing selected" />
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.section {
  margin: 16px 0 8px;
  font-size: 13px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.path {
  font-size: 11px;
  word-break: break-all;
  color: #6ee7ff;
}
</style>
