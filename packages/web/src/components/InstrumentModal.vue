<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  NModal,
  NCard,
  NSpin,
  NCode,
  NButton,
  NSpace,
  NAlert,
  NDivider,
  useMessage,
} from 'naive-ui';
import { ProjectsApi, type InstrumentationPlanDTO } from '@/api/client';

const props = defineProps<{ show: boolean; projectId: string | null }>();
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>();

const message = useMessage();
const loading = ref(false);
const applying = ref(false);
const plan = ref<InstrumentationPlanDTO | null>(null);

watch(
  () => [props.show, props.projectId] as const,
  async ([show, id]) => {
    if (!show || !id) return;
    loading.value = true;
    plan.value = null;
    try {
      plan.value = await ProjectsApi.getInstrumentationPlan(id);
    } catch (err) {
      message.error((err as Error).message);
      emit('update:show', false);
    } finally {
      loading.value = false;
    }
  },
);

async function apply() {
  if (!props.projectId) return;
  applying.value = true;
  try {
    const result = await ProjectsApi.applyInstrumentation(props.projectId);
    message.success(`Wrote ${result.written.length} file(s), patched ${result.patched.length}`);
    emit('update:show', false);
  } catch (err) {
    message.error((err as Error).message);
  } finally {
    applying.value = false;
  }
}
</script>

<template>
  <NModal
    :show="show"
    :auto-focus="false"
    preset="card"
    style="width: 720px; max-width: 90vw"
    title="Install Hook Instrumentation"
    closable
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <NSpin v-if="loading" />
    <div v-else-if="plan">
      <NAlert type="warning" :show-icon="true" style="margin-bottom: 16px">
        AgentFlow is about to write files into your project. Review carefully before applying.
      </NAlert>

      <h4 class="section">Files to write ({{ plan.files.length }})</h4>
      <NCard
        v-for="file in plan.files"
        :key="file.path"
        size="small"
        class="file-card"
        :title="file.path"
      >
        <NCode :code="file.content.slice(0, 1200)" language="javascript" word-wrap />
        <p v-if="file.content.length > 1200" class="truncated">
          … {{ file.content.length - 1200 }} more chars
        </p>
      </NCard>

      <NDivider />

      <h4 class="section">Patches to apply ({{ plan.patches.length }})</h4>
      <NCard
        v-for="(patch, i) in plan.patches"
        :key="i"
        size="small"
        class="file-card"
        :title="`${patch.path}  (${patch.operation})`"
      >
        <NCode :code="JSON.stringify(patch.payload, null, 2)" language="json" word-wrap />
      </NCard>

      <NDivider />

      <p class="instructions">{{ plan.instructions }}</p>
    </div>

    <template #action>
      <NSpace v-if="plan" justify="end">
        <NButton @click="emit('update:show', false)">Cancel</NButton>
        <NButton type="primary" :loading="applying" @click="apply">Apply</NButton>
      </NSpace>
    </template>
  </NModal>
</template>

<style scoped>
.section {
  margin: 8px 0 8px;
  font-size: 13px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.file-card {
  margin-bottom: 12px;
  background: rgba(15, 22, 38, 0.5);
}
.truncated {
  margin-top: 8px;
  color: #94a3b8;
  font-size: 12px;
}
.instructions {
  white-space: pre-wrap;
  color: #c8d2e6;
  font-size: 13px;
}
</style>
