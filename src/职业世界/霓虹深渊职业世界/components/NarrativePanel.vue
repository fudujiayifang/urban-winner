<script setup lang="ts">
import type { NarrativeBlock } from '../adapters/runtime';
import { isSceneDividerText, splitNarrativeSegments } from '../services/response-parser';

const props = defineProps<{
  blocks: NarrativeBlock[];
  embedded?: boolean;
}>();

const tailAnchor = ref<HTMLElement | null>(null);

const renderBlocks = computed(() => props.blocks.map((block, index) => ({
  ...block,
  index,
  isDivider: block.kind !== 'player' && isSceneDividerText(block.text),
  segments: splitNarrativeSegments(block.text),
})));

watch(
  () => {
    const lastBlock = props.blocks.at(-1);
    return lastBlock ? `${lastBlock.id}:${lastBlock.text.length}` : 'empty';
  },
  async () => {
    await nextTick();
    tailAnchor.value?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  },
  { flush: 'post' },
);
</script>

<template>
  <div class="narrative-surface" :class="{ 'narrative-surface--embedded': props.embedded }">
    <template v-for="block in renderBlocks" :key="block.id">
      <div v-if="block.isDivider" class="scene-divider">
        <span>{{ block.text.replace(/[◇◆◈]/g, '').trim() || 'SCENE' }}</span>
      </div>

      <article
        v-else
        class="narrative-block"
        :class="[
          `block-${block.kind}`,
          { 'block-latest': block.index === renderBlocks.length - 1, 'narrative-block--embedded': props.embedded },
        ]"
      >
        <span v-if="block.kind === 'player'" class="player-prefix">&gt;</span>
        <span class="block-text">
          <span
            v-for="(segment, segmentIndex) in block.segments"
            :key="`${block.id}-${segmentIndex}`"
            :class="segment.kind === 'npc-name' ? 'npc-name' : undefined"
          >{{ segment.text }}</span>
        </span>
      </article>
    </template>
    <span ref="tailAnchor" class="tail-anchor" aria-hidden="true" />
  </div>
</template>

<style scoped lang="scss">
.narrative-surface {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 76ch;
  margin: 0 auto;
  padding: 18px 4px 8px;
  box-sizing: border-box;
}

.narrative-surface--embedded {
  max-width: none;
  margin: 0;
  padding: 12px 0 6px;
  gap: 14px;
}

.narrative-block {
  color: #e8e4f0;
  font-family: 'Noto Serif SC', 'SimSun', serif;
  font-size: 17px;
  line-height: 1.95;
  letter-spacing: 0;
  overflow-wrap: anywhere;
  animation: narrativeFadeIn 0.36s ease-out both;
}

.narrative-block--embedded {
  font-size: 16px;
  line-height: 1.88;
}

.block-text {
  white-space: pre-wrap;
}

.block-intro {
  color: #c8c2d8;
  font-size: 16px;
}

.block-maintext {
  color: #eeeaf6;
}

.block-system {
  position: relative;
  padding: 12px 16px 12px 18px;
  border-left: 2px solid #00e5ff;
  border-radius: 0 7px 7px 0;
  background: linear-gradient(90deg, rgba(0, 229, 255, 0.1), rgba(0, 229, 255, 0.025));
  box-shadow: inset 0 1px 0 rgba(0, 229, 255, 0.08), 0 0 18px rgba(0, 229, 255, 0.08);
  color: #76f4ff;
  font-family: 'JetBrains Mono', 'Microsoft YaHei', monospace;
  font-size: 12px;
  line-height: 1.75;
}

.block-system::before {
  content: '';
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: -2px;
  width: 2px;
  background: linear-gradient(180deg, #00e5ff, rgba(0, 229, 255, 0));
  box-shadow: 0 0 12px rgba(0, 229, 255, 0.55);
}

.block-player {
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 11px 0;
  border-top: 1px solid rgba(0, 229, 255, 0.18);
  border-bottom: 1px solid rgba(168, 85, 247, 0.12);
  color: #00e5ff;
  font-family: 'JetBrains Mono', 'Microsoft YaHei', monospace;
  font-size: 13px;
  opacity: 0.92;
}

.player-prefix {
  flex: 0 0 auto;
  color: #a855f7;
  text-shadow: 0 0 10px rgba(168, 85, 247, 0.45);
}

.npc-name {
  color: #d8a0ff;
  font-weight: 700;
  text-shadow: 0 0 10px rgba(168, 85, 247, 0.45), 0 0 24px rgba(168, 85, 247, 0.16);
}

.scene-divider {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 12px 0 10px;
  color: #8a86a8;
  font-family: 'JetBrains Mono', 'Microsoft YaHei', monospace;
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.scene-divider::before,
.scene-divider::after {
  content: '';
  flex: 1 1 auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(0, 229, 255, 0.32), transparent);
}

.tail-anchor {
  display: block;
  width: 1px;
  height: 1px;
}

@keyframes narrativeFadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 640px) {
  .narrative-surface {
    max-width: none;
    padding-top: 12px;
  }

  .narrative-block {
    font-size: 16px;
    line-height: 1.85;
  }
}
</style>
