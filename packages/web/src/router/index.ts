import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/projects' },
    { path: '/projects', component: () => import('@/views/ProjectsView.vue'), meta: { title: 'Projects' } },
    { path: '/flowchart', component: () => import('@/views/FlowchartView.vue'), meta: { title: 'Flowchart' } },
    { path: '/timeline', component: () => import('@/views/TimelineView.vue'), meta: { title: 'Timeline' } },
    { path: '/table', component: () => import('@/views/TableView.vue'), meta: { title: 'Table' } },
    { path: '/about', component: () => import('@/views/AboutView.vue'), meta: { title: 'About' } },
  ],
});
