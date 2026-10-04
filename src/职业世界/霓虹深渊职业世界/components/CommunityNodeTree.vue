<script setup lang="ts">
import type { CommunityReactionKind, CommunityReply, PhoneFeedPost } from '../schema';
import { COMMUNITY_MAX_DEPTH } from '../services/community-state';

defineOptions({ name: 'CommunityNodeTree' });

const props = defineProps<{
  post: PhoneFeedPost;
  node: CommunityReply;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  react: [payload: { nodeId: string; reaction: CommunityReactionKind }];
  reply: [nodeId: string];
}>();

function toggleReaction(reaction: CommunityReactionKind): void {
  if (props.disabled) {
    return;
  }

  emit('react', { nodeId: props.node.id, reaction });
}

function startReply(): void {
  if (props.disabled) {
    return;
  }

  emit('reply', props.node.id);
}
</script>

<template>
  <article class="community-node" :class="[`community-node--depth-${node.depth}`]">
    <div class="community-node__head">
      <strong>{{ node.author }}</strong>
      <span>{{ node.at }}</span>
    </div>
    <p class="community-node__body">{{ node.body }}</p>
    <div class="community-node__actions">
      <button type="button" class="community-reaction" :class="{ 'community-reaction--active': node.playerReaction === 'like' }" @click="toggleReaction('like')">赞 {{ node.reactions.like }}</button>
      <button type="button" class="community-reaction" :class="{ 'community-reaction--active': node.playerReaction === 'dislike' }" @click="toggleReaction('dislike')">踩 {{ node.reactions.dislike }}</button>
      <button v-if="node.depth < COMMUNITY_MAX_DEPTH" type="button" class="community-link" :disabled="disabled" @click="startReply">回复</button>
    </div>

    <div v-if="node.replies.length" class="community-node__children">
      <CommunityNodeTree
        v-for="reply in node.replies"
        :key="reply.id"
        :post="post"
        :node="reply"
        :disabled="disabled"
        @react="emit('react', $event)"
        @reply="emit('reply', $event)"
      />
    </div>
  </article>
</template>

<style scoped lang="scss">
.community-node {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
}

.community-node__head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.community-node__head strong {
  color: #20232d;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.community-node__head span {
  color: #8d94a2;
  font-size: 11px;
}

.community-node__body {
  margin: 0;
  color: #4c5261;
  font-size: 12px;
  line-height: 1.55;
}

.community-node__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.community-node__children {
  display: grid;
  gap: 8px;
  padding-left: 10px;
  border-left: 2px solid rgba(255, 121, 150, 0.16);
}

.community-node--depth-2,
.community-node--depth-3,
.community-node--depth-4,
.community-node--depth-5,
.community-node--depth-6 {
  background: rgba(255, 255, 255, 0.74);
}
</style>
