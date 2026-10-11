<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ManualSaveSnapshot } from '../adapters/runtime';

type ModalMode = 'manage' | 'load';
type ConfirmAction = 'overwrite' | 'delete' | null;

const props = defineProps<{
  mode: ModalMode;
  saves: ManualSaveSnapshot[];
}>();

const emit = defineEmits<{
  close: [];
  save: [name: string];
  load: [id: string];
  overwrite: [id: string];
  rename: [id: string, name: string];
  delete: [id: string];
}>();

const newNameDraft = ref('');
const renameDraft = ref('');
const activeRenameId = ref<string | null>(null);
const confirmAction = ref<ConfirmAction>(null);
const confirmSaveId = ref<string | null>(null);

watch(
  () => props.mode,
  () => {
    newNameDraft.value = '';
    renameDraft.value = '';
    activeRenameId.value = null;
    confirmAction.value = null;
    confirmSaveId.value = null;
  },
  { immediate: true },
);

function createSave(): void {
  const name = newNameDraft.value.trim();
  if (!name) {
    return;
  }

  emit('save', name);
  newNameDraft.value = '';
}

function requestOverwrite(id: string): void {
  activeRenameId.value = null;
  confirmSaveId.value = id;
  confirmAction.value = 'overwrite';
}

function requestDelete(id: string): void {
  activeRenameId.value = null;
  confirmSaveId.value = id;
  confirmAction.value = 'delete';
}

function confirmActionRequest(): void {
  if (!confirmAction.value || !confirmSaveId.value) {
    return;
  }

  if (confirmAction.value === 'overwrite') {
    emit('overwrite', confirmSaveId.value);
  } else {
    emit('delete', confirmSaveId.value);
  }

  cancelAction();
}

function cancelAction(): void {
  confirmAction.value = null;
  confirmSaveId.value = null;
}

function startRename(save: ManualSaveSnapshot): void {
  cancelAction();
  activeRenameId.value = save.id;
  renameDraft.value = save.name;
}

function cancelRename(): void {
  activeRenameId.value = null;
  renameDraft.value = '';
}

function confirmRename(): void {
  const id = activeRenameId.value;
  const name = renameDraft.value.trim();
  if (!id || !name) {
    return;
  }

  emit('rename', id, name);
  cancelRename();
}

function formatSavedAt(savedAt: string): string {
  const date = new Date(savedAt);
  return Number.isNaN(date.getTime()) ? savedAt : date.toLocaleString();
}
</script>

<template>
  <div class="manual-save-backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
    <section
      class="manual-save-modal"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="mode === 'manage' ? 'manual-manage-title' : 'manual-load-title'"
    >
      <header class="manual-save-header">
        <div>
          <p class="manual-save-kicker">存档管理</p>
          <h2 :id="mode === 'manage' ? 'manual-manage-title' : 'manual-load-title'">
            {{ mode === 'manage' ? '存档列表' : '选择存档' }}
          </h2>
        </div>
        <button class="manual-save-close" type="button" aria-label="关闭存档窗口" @click="emit('close')">×</button>
      </header>

      <div class="manual-save-body">
        <template v-if="mode === 'manage'">
          <p class="manual-save-summary">点击已有存档可以覆盖当前进度，也可以改名或删除；所有操作都会先确认。</p>
          <div class="manual-save-create">
            <label class="manual-save-field">
              <span>新存档名称</span>
              <input
                v-model="newNameDraft"
                type="text"
                maxlength="40"
                placeholder="例如：进入学院前"
                autofocus
                @keydown.enter.prevent="createSave"
              />
            </label>
            <button
              class="manual-save-action manual-save-action--primary"
              type="button"
              :disabled="!newNameDraft.trim()"
              @click="createSave"
            >
              新建存档
            </button>
          </div>
        </template>

        <p v-if="props.saves.length === 0" class="manual-save-empty">
          {{ mode === 'manage' ? '还没有存档，现在可以新建一个。' : '暂无存档记录。' }}
        </p>
        <div v-else class="manual-save-list">
          <article v-for="save in props.saves" :key="save.id" class="manual-save-entry">
            <button
              v-if="mode === 'manage'"
              class="manual-save-entry-main"
              type="button"
              @click="requestOverwrite(save.id)"
            >
              <strong>{{ save.name }}</strong>
              <span>{{ formatSavedAt(save.savedAt) }}</span>
            </button>
            <div v-else class="manual-save-entry-copy">
              <strong>{{ save.name }}</strong>
              <span>{{ formatSavedAt(save.savedAt) }}</span>
            </div>

            <div v-if="activeRenameId === save.id" class="manual-save-rename">
              <input
                v-model="renameDraft"
                type="text"
                maxlength="40"
                aria-label="新的存档名称"
                @keydown.enter.prevent="confirmRename"
                @keydown.esc="cancelRename"
              />
              <button
                class="manual-save-action manual-save-action--primary"
                type="button"
                :disabled="!renameDraft.trim()"
                @click="confirmRename"
              >
                确定
              </button>
              <button class="manual-save-action" type="button" @click="cancelRename">取消</button>
            </div>
            <div v-else class="manual-save-entry-actions">
              <button
                v-if="mode === 'load'"
                class="manual-save-action manual-save-action--primary"
                type="button"
                @click="emit('load', save.id)"
              >
                读档
              </button>
              <button v-if="mode === 'manage'" class="manual-save-action" type="button" @click="requestOverwrite(save.id)">
                覆盖
              </button>
              <button class="manual-save-action" type="button" @click="startRename(save)">改名</button>
              <button class="manual-save-action manual-save-action--danger" type="button" @click="requestDelete(save.id)">
                删除
              </button>
            </div>

            <div v-if="confirmSaveId === save.id && confirmAction" class="manual-save-confirm" role="alertdialog">
              <p>
                {{ confirmAction === 'overwrite' ? `是否覆盖存档“${save.name}”？` : `是否删除存档“${save.name}”？` }}
              </p>
              <div class="manual-save-confirm-actions">
                <button class="manual-save-action manual-save-action--primary" type="button" @click="confirmActionRequest">
                  是
                </button>
                <button class="manual-save-action" type="button" @click="cancelAction">否</button>
              </div>
            </div>
          </article>
        </div>
      </div>

      <footer class="manual-save-footer">
        <button class="manual-save-action" type="button" @click="emit('close')">关闭</button>
      </footer>
    </section>
  </div>
</template>

<style scoped lang="scss">
.manual-save-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.72);
}

.manual-save-modal {
  display: flex;
  width: min(680px, 100%);
  max-height: calc(100dvh - 40px);
  flex-direction: column;
  border: 1px solid rgba(38, 49, 91, 0.92);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(13, 14, 28, 0.98) 0%, rgba(9, 10, 18, 0.98) 100%);
  box-shadow: 0 28px 72px rgba(0, 0, 0, 0.5);
  color: #eef2ff;
}

.manual-save-header,
.manual-save-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
}

.manual-save-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.manual-save-kicker {
  margin: 0 0 6px;
  color: #8b95b4;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  font-size: 18px;
}

.manual-save-close {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  color: #aeb7d1;
  cursor: pointer;
  font-size: 24px;
  line-height: 1;
}

.manual-save-body {
  min-height: 0;
  padding: 18px;
  overflow-y: auto;
}

.manual-save-summary,
.manual-save-empty {
  margin: 0 0 16px;
  color: #aeb7d1;
  font-size: 14px;
  line-height: 1.6;
}

.manual-save-create {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 18px;
}

.manual-save-field {
  display: grid;
  flex: 1 1 auto;
  gap: 8px;
  color: #dbe3ff;
  font-size: 13px;
}

.manual-save-field input,
.manual-save-rename input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(0, 229, 255, 0.22);
  border-radius: 8px;
  padding: 11px 12px;
  outline: none;
  background: rgba(255, 255, 255, 0.04);
  color: #eef2ff;
  font: inherit;
}

.manual-save-field input:focus,
.manual-save-rename input:focus {
  border-color: rgba(0, 229, 255, 0.72);
  box-shadow: 0 0 0 3px rgba(0, 229, 255, 0.1);
}

.manual-save-list {
  display: grid;
  gap: 10px;
}

.manual-save-entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.manual-save-entry-main,
.manual-save-entry-copy {
  display: grid;
  min-width: 0;
  align-content: center;
  gap: 5px;
}

.manual-save-entry-main {
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.manual-save-entry-main:hover strong {
  color: #76f4ff;
}

.manual-save-entry-main strong,
.manual-save-entry-copy strong {
  overflow: hidden;
  color: #eef2ff;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manual-save-entry-main span,
.manual-save-entry-copy span {
  color: #8b95b4;
  font-size: 12px;
}

.manual-save-entry-actions,
.manual-save-rename,
.manual-save-confirm-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.manual-save-rename {
  grid-column: 1 / -1;
}

.manual-save-rename input {
  min-width: 160px;
  flex: 1 1 180px;
}

.manual-save-confirm {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 10px;
}

.manual-save-confirm p {
  margin: 0;
  color: #ffd4dc;
  font-size: 13px;
}

.manual-save-footer {
  justify-content: flex-end;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.manual-save-action {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.04);
  color: #dbe3ff;
  cursor: pointer;
  font-size: 14px;
}

.manual-save-action--primary {
  border-color: rgba(0, 229, 255, 0.28);
  background: rgba(0, 229, 255, 0.12);
  color: #76f4ff;
}

.manual-save-action--danger {
  border-color: rgba(255, 107, 129, 0.28);
  background: rgba(255, 107, 129, 0.12);
  color: #ff8c9d;
}

.manual-save-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 720px) {
  .manual-save-backdrop {
    align-items: flex-start;
    padding: 8px;
  }

  .manual-save-modal {
    max-height: calc(100dvh - 16px);
  }

  .manual-save-header,
  .manual-save-body,
  .manual-save-footer {
    padding: 12px;
  }

  .manual-save-create {
    align-items: stretch;
    flex-direction: column;
  }

  .manual-save-entry {
    grid-template-columns: 1fr;
  }

  .manual-save-entry-actions,
  .manual-save-rename,
  .manual-save-confirm {
    justify-content: stretch;
  }

  .manual-save-entry-actions .manual-save-action,
  .manual-save-confirm-actions .manual-save-action {
    flex: 1 1 100px;
  }

  .manual-save-confirm {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
