<script setup lang="ts">
import { onMounted } from 'vue';
import { NLayout, NLayoutHeader, NLayoutSider, NLayoutContent } from 'naive-ui';
import AppHeader from './AppHeader.vue';
import FileTree from './FileTree.vue';
import DetailDrawer from './DetailDrawer.vue';
import { useProjectStore } from '@/stores/project';

const projectStore = useProjectStore();
onMounted(() => projectStore.refresh());
</script>

<template>
  <NLayout class="app-shell" position="absolute">
    <NLayoutHeader bordered class="app-header">
      <AppHeader />
    </NLayoutHeader>
    <NLayout has-sider position="absolute" style="top: 56px;">
      <NLayoutSider
        bordered
        :width="280"
        :native-scrollbar="false"
        class="app-sider"
      >
        <FileTree />
      </NLayoutSider>
      <NLayoutContent class="app-content" :native-scrollbar="false">
        <RouterView />
      </NLayoutContent>
    </NLayout>
    <DetailDrawer />
  </NLayout>
</template>

<style scoped>
.app-shell {
  background: radial-gradient(circle at top, #0d1320 0%, #05080f 100%);
}
.app-header {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 24px;
  backdrop-filter: blur(12px);
  background: rgba(10, 14, 24, 0.65);
}
.app-sider {
  background: rgba(10, 14, 24, 0.45);
}
.app-content {
  padding: 24px;
}
</style>
