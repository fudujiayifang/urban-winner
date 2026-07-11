import type { Component } from 'vue';

export type WorkspaceKey = 'inventory' | 'item-pool' | 'quests' | 'shop' | 'social' | 'checkin' | 'summary';
export type DetailKind = 'inventory-item' | 'inventory-result' | 'item-pool-item' | 'item-pool-edit' | 'item-pool-delete' | 'item-pool-create-menu' | 'item-pool-create-manual' | 'item-pool-export-create' | 'quest' | 'quest-reward' | 'shop-item' | 'shop-result' | 'social-target' | 'social-character';

export interface DetailField {
  label: string;
  value: string;
}

export interface DetailModalState {
  kind: DetailKind;
  title: string;
  summary?: string;
  fields?: DetailField[];
  chips?: string[];
  payload?: unknown;
  actions?: Array<{
    id: string;
    label: string;
    tone?: 'primary' | 'secondary' | 'danger';
  }>;
}

export interface WorkspaceDefinition {
  key: WorkspaceKey;
  label: string;
  icon: string;
  description: string;
  badge?: number | string | null;
  component: Component;
}

export const useUiStore = defineStore('neon-abyss-career-world.ui', () => {
  const activeWorkspace = ref<WorkspaceKey | null>(null);
  const detailModal = ref<DetailModalState | null>(null);
  const utilityRailCollapsed = ref(true);

  function openWorkspace(key: WorkspaceKey): void {
    activeWorkspace.value = key;
  }

  function closeWorkspace(): void {
    activeWorkspace.value = null;
  }

  function toggleWorkspace(key: WorkspaceKey): void {
    activeWorkspace.value = activeWorkspace.value === key ? null : key;
  }

  function openDetailModal(state: DetailModalState): void {
    detailModal.value = state;
  }

  function closeDetailModal(): void {
    detailModal.value = null;
  }

  function toggleUtilityRail(): void {
    utilityRailCollapsed.value = !utilityRailCollapsed.value;
  }

  return {
    activeWorkspace,
    detailModal,
    utilityRailCollapsed,
    openWorkspace,
    closeWorkspace,
    toggleWorkspace,
    openDetailModal,
    closeDetailModal,
    toggleUtilityRail,
  };
});
