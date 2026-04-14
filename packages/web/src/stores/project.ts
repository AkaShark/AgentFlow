import { defineStore } from 'pinia';
import { ProjectsApi, type Project } from '@/api/client';

export const useProjectStore = defineStore('project', {
  state: () => ({
    projects: [] as Project[],
    currentId: null as string | null,
    loading: false,
  }),
  getters: {
    current(state): Project | null {
      return state.projects.find((p) => p.id === state.currentId) ?? null;
    },
    hasProjects(state): boolean {
      return state.projects.length > 0;
    },
  },
  actions: {
    async refresh() {
      this.loading = true;
      try {
        this.projects = await ProjectsApi.list();
        if (!this.currentId && this.projects[0]) this.currentId = this.projects[0].id;
        if (this.currentId && !this.projects.find((p) => p.id === this.currentId)) {
          this.currentId = this.projects[0]?.id ?? null;
        }
      } finally {
        this.loading = false;
      }
    },
    async addProject(rootPath: string, name?: string, withInstrument = false) {
      const project = await ProjectsApi.create(rootPath, name);
      await ProjectsApi.scan(project.id);
      if (withInstrument) {
        try {
          await ProjectsApi.applyInstrumentation(project.id);
        } catch {
          // Non-fatal: project is created and scanned even if instrumentation fails
        }
      }
      await this.refresh();
      this.currentId = project.id;
      return project;
    },
    async removeProject(id: string) {
      await ProjectsApi.remove(id);
      if (this.currentId === id) this.currentId = null;
      await this.refresh();
    },
    async rescan(id: string) {
      await ProjectsApi.scan(id);
      await this.refresh();
    },
    select(id: string) {
      this.currentId = id;
    },
  },
});
