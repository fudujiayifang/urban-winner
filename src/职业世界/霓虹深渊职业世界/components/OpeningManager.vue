<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CustomOpening } from '../adapters/runtime';

const props = defineProps<{ openings: CustomOpening[]; generate: (prompt: string) => Promise<string> }>();
const emit = defineEmits<{ close: []; save: [opening: CustomOpening]; delete: [id: string] }>();
const editing = ref<CustomOpening | null>(null);
const name = ref('');
const content = ref('');
const request = ref('');
const naming = ref(false);
const busy = ref(false);
const error = ref('');
const isEditing = computed(() => editing.value !== null);

watch(() => props.openings, openings => {
  if (editing.value && !openings.some(item => item.id === editing.value?.id)) resetEditor();
});
function resetEditor(): void { editing.value = null; name.value = ''; content.value = ''; request.value = ''; naming.value = false; error.value = ''; }
function createOpening(): void { resetEditor(); editing.value = { id: crypto.randomUUID(), name: '', content: '' }; }
function editOpening(opening: CustomOpening): void { editing.value = opening; name.value = opening.name; content.value = opening.content; error.value = ''; }
function confirmContent(): void {
  if (!content.value.trim()) { error.value = '请先编写开场白内容。'; return; }
  naming.value = true;
  error.value = '';
}
function saveOpening(): void {
  const trimmedContent = content.value.trim();
  if (!editing.value || !trimmedContent) { error.value = '请先编写开场白内容。'; return; }
  if (!name.value.trim()) { error.value = '请为这个开场白命名。'; return; }
  emit('save', { ...editing.value, name: name.value.trim(), content: trimmedContent });
  resetEditor();
}
async function generateOpening(): Promise<void> {
  if (!request.value.trim()) { error.value = '请先写下希望开场白包含的信息。'; return; }
  busy.value = true; error.value = '';
  try { content.value = await props.generate(request.value.trim()); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="opening-backdrop" role="presentation" @click.self="emit('close')">
    <section class="opening-manager" role="dialog" aria-modal="true" aria-labelledby="opening-manager-title">
      <header class="manager-header">
        <h2 id="opening-manager-title">{{ isEditing ? (props.openings.some(item => item.id === editing?.id) ? '编辑开场白' : '编写开场白') : '自定义开场白' }}</h2>
        <button class="icon-button" type="button" aria-label="关闭" @click="emit('close')">×</button>
      </header>
      <template v-if="isEditing">
        <div class="editor-body">
          <template v-if="!naming">
            <label>开场白内容<textarea v-model="content" maxlength="12000" rows="12" placeholder="写下这一局的开场场景和角色回应"></textarea></label>
            <aside class="ai-panel">
              <h3>AI 生成开场白</h3>
              <label>提供给 AI 的信息<textarea v-model="request" rows="3" placeholder="例如：从新生抵达宿舍开始，突出初次见面的紧张感"></textarea></label>
              <button class="action action--ai" type="button" :disabled="busy" @click="generateOpening">{{ busy ? '正在生成…' : 'AI 生成开场白' }}</button>
            </aside>
          </template>
          <label v-else>开场白名称<input v-model="name" type="text" maxlength="60" autofocus placeholder="例如：初到天穹学府" /></label>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
        </div>
        <footer class="editor-footer"><button class="action" type="button" @click="resetEditor">取消</button><button v-if="!naming" class="action action--primary" type="button" @click="confirmContent">确定</button><button v-else class="action action--primary" type="button" @click="saveOpening">保存</button></footer>
      </template>
      <template v-else>
        <div class="manager-toolbar"><button class="action action--primary add-button" type="button" aria-label="新增开场白" @click="createOpening">＋</button><span>{{ openings.length }} 条自定义开场白</span><span class="toolbar-spacer"></span></div>
        <p v-if="!openings.length" class="empty">还没有自定义开场白</p>
        <div v-else class="opening-list"><article v-for="opening in openings" :key="opening.id" class="opening-entry"><button class="entry-copy" type="button" @click="editOpening(opening)"><strong>{{ opening.name }}</strong><span>{{ opening.content.slice(0, 120) }}{{ opening.content.length > 120 ? '…' : '' }}</span></button><div class="entry-actions"><button class="action" type="button" @click="editOpening(opening)">编辑</button><button class="action action--danger" type="button" @click="emit('delete', opening.id)">删除</button></div></article></div>
        <footer class="editor-footer"><button class="action action--primary" type="button" @click="emit('close')">完成</button></footer>
      </template>
    </section>
  </div>
</template>

<style scoped lang="scss">
.opening-backdrop{position:fixed;inset:0;z-index:2200;display:grid;place-items:center;padding:16px;background:rgba(2,5,12,.82);backdrop-filter:blur(8px)}.opening-manager{display:flex;flex-direction:column;width:min(680px,100%);max-height:min(88dvh,820px);border:1px solid #31505d;background:#090f1c;color:#e8edf4;box-shadow:0 20px 80px #000}.manager-header,.manager-toolbar,.editor-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #263445}.manager-header h2{margin:0;font-size:19px}.icon-button{width:40px;height:40px;border:1px solid #455267;background:transparent;color:inherit;font-size:24px}.editor-body{display:grid;gap:16px;padding:18px;overflow:auto}.editor-body label,.ai-panel label{display:grid;gap:8px;font-size:13px}.editor-body textarea,.ai-panel textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid #37465b;background:#070b13;color:#e8edf4;font:14px/1.65 'Noto Sans SC','Microsoft YaHei',sans-serif;resize:vertical}.editor-body input{box-sizing:border-box;width:100%;padding:11px 12px;border:1px solid #37465b;background:#070b13;color:#e8edf4;font:14px 'Noto Sans SC','Microsoft YaHei',sans-serif}.editor-body textarea:focus,.editor-body input:focus,.ai-panel textarea:focus{outline:1px solid #23d7c5}.ai-panel{display:grid;gap:10px;padding:14px;border-left:2px solid #23d7c5;background:#101a25}.ai-panel h3{margin:0;font-size:15px}.manager-toolbar{border-top:1px solid #263445;color:#aab8c8}.toolbar-spacer{flex:1}.action{min-height:42px;padding:8px 14px;border:1px solid #49576a;background:#111a28;color:#e8edf4;cursor:pointer}.action--primary{border-color:#23d7c5;background:#102b31;color:#c6fff5}.action--ai{justify-self:start;border-color:#23d7c5}.action--danger{border-color:#aa5963;color:#ffb6bd}.action:disabled{opacity:.5;cursor:wait}.add-button{width:44px;font-size:22px}.opening-list{overflow:auto}.opening-entry{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px 18px;border-bottom:1px solid #263445}.entry-copy{display:grid;gap:6px;min-width:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}.entry-copy span{color:#95a3b6;font-size:13px;line-height:1.5;overflow-wrap:anywhere}.entry-actions{display:flex;gap:8px}.editor-footer{justify-content:space-between;border-top:1px solid #263445;border-bottom:0}.empty{padding:28px;text-align:center;color:#95a3b6}.error{margin:0;color:#ff8795;font-size:13px}@media(max-width:520px){.opening-backdrop{padding:8px}.opening-entry{grid-template-columns:1fr}.entry-actions{justify-content:flex-end}.editor-body{padding:12px}.manager-header,.manager-toolbar,.editor-footer{padding:12px}}
</style>
