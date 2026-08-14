<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { PhoneFeedPost, PhoneOrder, PhonePrivateAgreementEntry, PhonePrivateMemoryEntry, PhoneState } from '../schema';
import { getOrderStatusLabel, type PhoneAction, type PhoneAppKey, type PhoneCatalogItem } from '../services/phone-actions';

const props = defineProps<{
  phone: PhoneState;
  contacts: string[];
  catalog: PhoneCatalogItem[];
  money: number;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  action: [action: PhoneAction];
}>();

interface PhoneAppMeta {
  key: PhoneAppKey;
  label: string;
  subtitle: string;
  dock?: boolean;
}

const isOpen = ref(false);
const isHome = ref(true);
const activeApp = ref<PhoneAppKey>('contacts');
const selectedContact = ref('');
const messageDraft = ref('');
const feedTitleDraft = ref('');
const feedBodyDraft = ref('');
const isAwaitingReply = ref(false);
const awaitingReplyIncomingCount = ref(0);
const isMemoryDetailOpen = ref(false);
const feedback = ref<string | null>(null);
const phonePosition = ref<{ x: number; y: number } | null>(null);
const launcherPosition = ref<{ x: number; y: number } | null>(null);
const dragState = ref<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
const launcherDragState = ref<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
const suppressNextLauncherClick = ref(false);

const apps: PhoneAppMeta[] = [
  { key: 'contacts', label: '联系人', subtitle: '通话与消息', dock: true },
  { key: 'forum', label: '论坛', subtitle: '职业者广场' },
  { key: 'delivery', label: '外卖', subtitle: '附近配送' },
  { key: 'tieba', label: '贴吧', subtitle: 'G栋匿名墙' },
  { key: 'taobao', label: '淘宝', subtitle: '异界购物' },
  { key: 'orders', label: '订单', subtitle: '包裹与签收', dock: true },
];

const homeApps = computed(() => apps.filter(app => !app.dock));
const dockApps = computed(() => apps.filter(app => app.dock));
const activeAppMeta = computed(() => apps.find(app => app.key === activeApp.value) ?? apps[0]);
const sortedContacts = computed(() => {
  const trackedContacts = props.contacts.length ? props.contacts : Object.keys(props.phone.通讯记录);
  return [...new Set(trackedContacts.filter(Boolean))];
});
const activeContact = computed(() => selectedContact.value || sortedContacts.value[0] || '');
const activeThread = computed(() => props.phone.通讯记录[activeContact.value]?.messages ?? []);
const activePrivateMemory = computed(() => props.phone.通讯记录[activeContact.value]?.privateChatMemory ?? null);
const hasActivePrivateMemory = computed(() => Boolean(
  activePrivateMemory.value?.summary
  || activePrivateMemory.value?.agreements?.length
  || activePrivateMemory.value?.unresolvedTopics?.length
  || activePrivateMemory.value?.keyMemories?.length,
));
const deliveryItems = computed(() => props.catalog.filter(item => item.app === 'delivery'));
const taobaoItems = computed(() => props.catalog.filter(item => item.app === 'taobao'));
const orders = computed(() => Object.values(props.phone.订单).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
const forumPosts = computed(() => getFeedPosts('forum'));
const tiebaPosts = computed(() => getFeedPosts('tieba'));
const unreadCount = computed(() => Object.values(props.phone.通讯记录).reduce((sum, thread) => sum + thread.unread, 0));
const pendingOrderCount = computed(() => orders.value.filter(order => order.status !== 'picked_up' && order.status !== 'cancelled').length);
const phoneShellStyle = computed(() => phonePosition.value
  ? {
      left: `${phonePosition.value.x}px`,
      top: `${phonePosition.value.y}px`,
      right: 'auto',
      bottom: 'auto',
    }
  : {});
const launcherStyle = computed(() => launcherPosition.value
  ? {
      left: `${launcherPosition.value.x}px`,
      top: `${launcherPosition.value.y}px`,
      right: 'auto',
      bottom: 'auto',
    }
  : {});

function clampFloatingPosition(x: number, y: number, width: number, height: number): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x, y };
  }

  return {
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - height - 8)),
  };
}

function clampPhonePosition(x: number, y: number): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x, y };
  }

  const width = Math.min(360, Math.max(292, window.innerWidth - 24));
  const height = Math.min(740, Math.max(520, window.innerHeight - 24));
  return clampFloatingPosition(x, y, width, height);
}

function reclampFloatingUi(): void {
  if (phonePosition.value) {
    phonePosition.value = clampPhonePosition(phonePosition.value.x, phonePosition.value.y);
  }

  if (launcherPosition.value) {
    launcherPosition.value = clampFloatingPosition(launcherPosition.value.x, launcherPosition.value.y, 50, 64);
  }
}

function startPhoneDrag(event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }

  const shell = (event.currentTarget as HTMLElement).closest('.phone-shell') as HTMLElement | null;
  const rect = shell?.getBoundingClientRect();
  if (!rect) {
    return;
  }

  dragState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: rect.left,
    originY: rect.top,
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function dragPhone(event: PointerEvent): void {
  const drag = dragState.value;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  phonePosition.value = clampPhonePosition(
    drag.originX + event.clientX - drag.startX,
    drag.originY + event.clientY - drag.startY,
  );
}

function stopPhoneDrag(event: PointerEvent): void {
  if (dragState.value?.pointerId !== event.pointerId) {
    return;
  }

  dragState.value = null;
}

function resetPhonePosition(): void {
  phonePosition.value = null;
}

function startLauncherDrag(event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  launcherDragState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: rect.left,
    originY: rect.top,
    moved: false,
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function dragLauncher(event: PointerEvent): void {
  const drag = launcherDragState.value;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - drag.startX;
  const deltaY = event.clientY - drag.startY;
  if (Math.abs(deltaX) + Math.abs(deltaY) > 4) {
    drag.moved = true;
  }

  launcherPosition.value = clampFloatingPosition(drag.originX + deltaX, drag.originY + deltaY, 50, 64);
}

function stopLauncherDrag(event: PointerEvent): void {
  const drag = launcherDragState.value;
  if (drag?.pointerId !== event.pointerId) {
    return;
  }

  suppressNextLauncherClick.value = drag.moved;
  launcherDragState.value = null;
}

function markActiveContactRead(): void {
  const target = activeContact.value;
  if (!target || props.phone.通讯记录[target]?.unread === 0) {
    return;
  }

  emit('action', { kind: 'contact-read', target });
}

function togglePhoneFromLauncher(): void {
  if (suppressNextLauncherClick.value) {
    suppressNextLauncherClick.value = false;
    return;
  }

  isOpen.value = !isOpen.value;
  if (isOpen.value && !isHome.value && activeApp.value === 'contacts') {
    markActiveContactRead();
  }
}

function getFeedPosts(app: 'forum' | 'tieba'): PhoneFeedPost[] {
  return props.phone.动态记录
    .filter(post => post.app === app)
    .slice()
    .reverse();
}

function openApp(app: PhoneAppKey): void {
  activeApp.value = app;
  isHome.value = false;
  feedback.value = null;
  if (app === 'contacts') {
    markActiveContactRead();
  }
}

function goHome(): void {
  isHome.value = true;
  feedback.value = null;
}

function selectContact(name: string): void {
  selectedContact.value = name;
  isMemoryDetailOpen.value = false;
  feedback.value = null;
  if (props.phone.通讯记录[name]?.unread > 0) {
    emit('action', { kind: 'contact-read', target: name });
  }
}

function openPrivateMemoryDetail(): void {
  if (!hasActivePrivateMemory.value) {
    return;
  }

  isMemoryDetailOpen.value = true;
}

function closePrivateMemoryDetail(): void {
  isMemoryDetailOpen.value = false;
}

const MEMORY_ENTRY_PREFIXES = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'] as const;

function formatMemoryEntry(entry: PhonePrivateMemoryEntry, index: number): string {
  const prefix = MEMORY_ENTRY_PREFIXES[index] ?? `${index + 1}.`;
  return entry.recordedAt
    ? `${prefix} ${entry.content} —— ${entry.recordedAt}`
    : `${prefix} ${entry.content}`;
}

function getAgreementStatusIcon(entry: PhonePrivateAgreementEntry): string {
  if (entry.status === 'completed') {
    return '✅';
  }
  if (entry.status === 'failed') {
    return '❌';
  }
  return '·';
}

function sendMessage(): void {
  const text = messageDraft.value.trim();
  if (!text || props.disabled || !activeContact.value) {
    return;
  }

  isAwaitingReply.value = true;
  awaitingReplyIncomingCount.value = activeThread.value.filter(message => message.direction === 'in').length;
  emit('action', { kind: 'contact-message', target: activeContact.value, text });
  messageDraft.value = '';
  feedback.value = `已发送给 ${activeContact.value}，等待回复…`;
}

function createFeedPost(app: 'forum' | 'tieba'): void {
  const title = feedTitleDraft.value.trim();
  const body = feedBodyDraft.value.trim();
  if (!title || !body || props.disabled) {
    feedback.value = '标题和内容都要填写。';
    return;
  }

  emit('action', { kind: 'feed-post', app, title, body });
  feedTitleDraft.value = '';
  feedBodyDraft.value = '';
  feedback.value = '帖子已提交到主叙事。';
}

function createOrder(item: PhoneCatalogItem): void {
  if (props.disabled) {
    return;
  }

  if (props.money < item.price) {
    feedback.value = `金钱不足，购买 ${item.title} 需要 ${item.price}。`;
    return;
  }

  emit('action', { kind: 'order-create', app: item.app, itemId: item.id });
  feedback.value = `已下单：${item.title}`;
}

function pickupOrder(order: PhoneOrder): void {
  if (props.disabled || order.status === 'picked_up' || order.status === 'cancelled') {
    return;
  }

  emit('action', { kind: 'order-pickup', orderId: order.id });
  feedback.value = `正在处理签收：${order.title}`;
}

function getAppBadge(app: PhoneAppKey): number | null {
  if (app === 'contacts' && unreadCount.value > 0) {
    return unreadCount.value;
  }

  if (app === 'orders' && pendingOrderCount.value > 0) {
    return pendingOrderCount.value;
  }

  return null;
}

watch(
  () => activeContact.value,
  () => {
    isMemoryDetailOpen.value = false;
  },
);

watch(
  () => props.disabled,
  disabled => {
    if (!disabled) {
      isAwaitingReply.value = false;
    }
  },
);

watch(
  () => activeThread.value.filter(message => message.direction === 'in').length,
  length => {
    if (isAwaitingReply.value && length > awaitingReplyIncomingCount.value) {
      isAwaitingReply.value = false;
      feedback.value = `${activeContact.value} 的私聊回复已送达`;
    }
  },
);

watch(
  () => props.phone.通讯记录[activeContact.value]?.unread ?? 0,
  unread => {
    if (unread > 0 && isOpen.value && !isHome.value && activeApp.value === 'contacts') {
      markActiveContactRead();
    }
  },
);

function handleViewportChange(): void {
  reclampFloatingUi();
}

onMounted(() => {
  window.addEventListener('resize', handleViewportChange);
  document.addEventListener('fullscreenchange', handleViewportChange);
  window.visualViewport?.addEventListener('resize', handleViewportChange);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleViewportChange);
  document.removeEventListener('fullscreenchange', handleViewportChange);
  window.visualViewport?.removeEventListener('resize', handleViewportChange);
});
</script>

<template>
  <div class="phone-launcher" :style="launcherStyle">
    <button
      class="phone-launcher__button"
      :class="{ 'phone-launcher__button--active': isOpen }"
      type="button"
      :aria-expanded="isOpen"
      aria-label="打开手机"
      @pointerdown="startLauncherDrag"
      @pointermove="dragLauncher"
      @pointerup="stopLauncherDrag"
      @pointercancel="stopLauncherDrag"
      @click="togglePhoneFromLauncher"
    >
      <span class="phone-launcher__screen">
        <span></span>
        <span></span>
        <span></span>
      </span>
      <span v-if="unreadCount || pendingOrderCount" class="phone-launcher__badge">{{ unreadCount + pendingOrderCount }}</span>
    </button>
  </div>

  <Teleport to="body">
    <transition name="phone-pop">
      <div v-if="isOpen" class="phone-overlay" @click.self="isOpen = false">
        <section class="phone-shell" :style="phoneShellStyle" aria-label="个人终端">
          <div class="phone-bezel">
            <div class="phone-display">
              <div
                class="phone-statusbar"
                title="拖动手机窗口，双击回到默认位置"
                @pointerdown="startPhoneDrag"
                @pointermove="dragPhone"
                @pointerup="stopPhoneDrag"
                @pointercancel="stopPhoneDrag"
                @dblclick="resetPhonePosition"
              >
                <strong>18:51</strong>
                <span class="phone-statusbar__icons">
                  <i>5G</i>
                  <i>▮▮▮</i>
                  <i>100%</i>
                </span>
              </div>
              <div class="phone-notch"></div>

              <div v-if="isHome" class="phone-home-screen">
                <div class="phone-wallpaper-mark">
                  <span class="phone-wallpaper-bunny">⌁</span>
                  <strong>职业世界</strong>
                  <em>开局上线</em>
                </div>

                <nav class="phone-home-grid" aria-label="手机应用">
                  <button
                    v-for="app in homeApps"
                    :key="app.key"
                    class="phone-app"
                    type="button"
                    @click="openApp(app.key)"
                  >
                    <span class="phone-app-picture" :class="`phone-app-picture--${app.key}`">
                      <span class="phone-app-picture__glyph"></span>
                    </span>
                    <span class="phone-app__label">{{ app.label }}</span>
                    <em v-if="getAppBadge(app.key)">{{ getAppBadge(app.key) }}</em>
                  </button>
                </nav>

                <nav class="phone-dock" aria-label="常用应用">
                  <button
                    v-for="app in dockApps"
                    :key="app.key"
                    class="phone-app phone-app--dock"
                    type="button"
                    @click="openApp(app.key)"
                  >
                    <span class="phone-app-picture" :class="`phone-app-picture--${app.key}`">
                      <span class="phone-app-picture__glyph"></span>
                    </span>
                    <span class="phone-app__label">{{ app.label }}</span>
                    <em v-if="getAppBadge(app.key)">{{ getAppBadge(app.key) }}</em>
                  </button>
                </nav>
              </div>

              <div v-else class="phone-app-screen">
                <header class="phone-app-header">
                  <button type="button" aria-label="返回桌面" @click="goHome">‹</button>
                  <span class="phone-app-picture phone-app-picture--small" :class="`phone-app-picture--${activeApp}`">
                    <span class="phone-app-picture__glyph"></span>
                  </span>
                  <div>
                    <strong>{{ activeAppMeta.label }}</strong>
                    <small>{{ activeAppMeta.subtitle }}</small>
                  </div>
                  <em>¥{{ props.money.toLocaleString() }}</em>
                </header>

                <main class="phone-screen">
                  <section v-if="activeApp === 'contacts'" class="phone-view phone-view--contacts">
                    <div class="contact-list" aria-label="联系人列表">
                      <button
                        v-for="contact in sortedContacts"
                        :key="contact"
                        class="contact-pill"
                        :class="{ 'contact-pill--active': activeContact === contact }"
                        type="button"
                        @click="selectContact(contact)"
                      >
                        <span>{{ contact.slice(0, 1) }}</span>
                        <strong>{{ contact }}</strong>
                      </button>
                    </div>

                    <div class="chat-panel">
                      <template v-if="isMemoryDetailOpen && activeContact">
                        <header class="chat-panel__header chat-panel__header--detail">
                          <button type="button" class="chat-panel__back" @click="closePrivateMemoryDetail">返回</button>
                          <div>
                            <span>私聊记忆</span>
                            <strong>{{ activeContact }}</strong>
                          </div>
                        </header>

                        <div class="private-memory-detail">
                          <p v-if="activePrivateMemory?.lastPrivateChatAt" class="private-memory-detail__meta">最后更新：{{ activePrivateMemory.lastPrivateChatAt }}</p>
                          <section v-if="activePrivateMemory?.summary" class="private-memory-section">
                            <h4>摘要</h4>
                            <p>{{ activePrivateMemory.summary }}</p>
                          </section>
                          <section v-if="activePrivateMemory?.agreements?.length" class="private-memory-section">
                            <h4>约定</h4>
                            <ol class="private-memory-list">
                              <li v-for="(entry, index) in activePrivateMemory.agreements" :key="`agreement-${index}-${entry.content}`">
                                <span class="private-memory-status" :class="`private-memory-status--${entry.status}`">{{ getAgreementStatusIcon(entry) }}</span>
                                <span class="private-memory-text">{{ formatMemoryEntry(entry, index) }}</span>
                              </li>
                            </ol>
                          </section>
                          <section v-if="activePrivateMemory?.unresolvedTopics?.length" class="private-memory-section">
                            <h4>待续</h4>
                            <ol class="private-memory-list">
                              <li v-for="(entry, index) in activePrivateMemory.unresolvedTopics" :key="`topic-${index}-${entry.content}`">{{ formatMemoryEntry(entry, index) }}</li>
                            </ol>
                          </section>
                          <section v-if="activePrivateMemory?.keyMemories?.length" class="private-memory-section">
                            <h4>关键记忆</h4>
                            <ol class="private-memory-list">
                              <li v-for="(entry, index) in activePrivateMemory.keyMemories" :key="`memory-${index}-${entry.content}`">{{ formatMemoryEntry(entry, index) }}</li>
                            </ol>
                          </section>
                          <p v-if="!hasActivePrivateMemory" class="empty-copy">当前还没有可查看的私聊记忆。</p>
                        </div>
                      </template>

                      <template v-else>
                        <header class="chat-panel__header">
                          <div>
                            <span>当前聊天</span>
                            <strong>{{ activeContact || '暂无联系人' }}</strong>
                          </div>
                          <button
                            v-if="hasActivePrivateMemory"
                            type="button"
                            class="chat-panel__memory-trigger"
                            @click="openPrivateMemoryDetail"
                          >
                            私聊记忆
                          </button>
                        </header>

                        <div class="message-list">
                          <p v-if="!sortedContacts.length" class="empty-copy">当前没有可用联系人。</p>
                          <p v-else-if="!activeThread.length" class="empty-copy">还没有通讯记录。</p>
                          <article
                            v-for="message in activeThread"
                            :key="message.id"
                            class="message-bubble"
                            :class="`message-bubble--${message.direction}`"
                          >
                            <p>{{ message.text }}</p>
                            <span>{{ message.at }}</span>
                          </article>
                          <article v-if="isAwaitingReply && activeContact" class="message-bubble message-bubble--typing">
                            <p>{{ activeContact }} 正在回复…</p>
                            <span>私聊处理中</span>
                          </article>
                        </div>

                        <div class="phone-compose">
                          <textarea
                            v-model="messageDraft"
                            rows="2"
                            :disabled="props.disabled || !activeContact"
                            :placeholder="activeContact ? '输入要发送的消息' : '当前没有可发送的联系人'"
                            @keydown.enter.exact.prevent="sendMessage"
                          ></textarea>
                          <button type="button" :disabled="props.disabled || !activeContact || !messageDraft.trim()" @click="sendMessage">发送</button>
                        </div>
                      </template>
                    </div>
                  </section>

                  <section v-else-if="activeApp === 'forum'" class="phone-view">
                    <div class="feed-composer">
                      <input v-model="feedTitleDraft" :disabled="props.disabled" type="text" placeholder="标题">
                      <textarea v-model="feedBodyDraft" :disabled="props.disabled" rows="3" placeholder="内容"></textarea>
                      <button type="button" :disabled="props.disabled" @click="createFeedPost('forum')">发布到论坛</button>
                    </div>

                    <div class="feed-list">
                      <article v-for="post in forumPosts" :key="post.id" class="feed-card">
                        <div>
                          <strong>{{ post.title }}</strong>
                          <span>{{ post.author }} · {{ post.at }}</span>
                        </div>
                        <p>{{ post.body }}</p>
                      </article>
                      <p v-if="!forumPosts.length" class="empty-copy">暂无动态。</p>
                    </div>
                  </section>

                  <section v-else-if="activeApp === 'tieba'" class="phone-view">
                    <div class="feed-composer">
                      <input v-model="feedTitleDraft" :disabled="props.disabled" type="text" placeholder="标题">
                      <textarea v-model="feedBodyDraft" :disabled="props.disabled" rows="3" placeholder="内容"></textarea>
                      <button type="button" :disabled="props.disabled" @click="createFeedPost('tieba')">发布到贴吧</button>
                    </div>

                    <div class="feed-list">
                      <article v-for="post in tiebaPosts" :key="post.id" class="feed-card">
                        <div>
                          <strong>{{ post.title }}</strong>
                          <span>{{ post.author }} · {{ post.at }}</span>
                        </div>
                        <p>{{ post.body }}</p>
                      </article>
                      <p v-if="!tiebaPosts.length" class="empty-copy">暂无动态。</p>
                    </div>
                  </section>

                  <section v-else-if="activeApp === 'delivery' || activeApp === 'taobao'" class="phone-view">
                    <div class="catalog-list">
                      <article
                        v-for="item in activeApp === 'delivery' ? deliveryItems : taobaoItems"
                        :key="item.id"
                        class="catalog-card"
                      >
                        <div class="catalog-card__icon">{{ item.icon }}</div>
                        <div class="catalog-card__body">
                          <div class="catalog-card__title">
                            <strong>{{ item.title }}</strong>
                            <span>{{ item.price }}</span>
                          </div>
                          <p>{{ item.description }}</p>
                          <small>{{ item.pickupLocation }} · {{ item.rarity }}</small>
                        </div>
                        <button type="button" :disabled="props.disabled || props.money < item.price" @click="createOrder(item)">下单</button>
                      </article>
                    </div>
                  </section>

                  <section v-else class="phone-view">
                    <div class="order-list">
                      <article v-for="order in orders" :key="order.id" class="order-card">
                        <div>
                          <strong>{{ order.title }}</strong>
                          <span>{{ order.app === 'delivery' ? '外卖' : '淘宝' }} · {{ getOrderStatusLabel(order.status) }}</span>
                        </div>
                        <p>{{ order.description }}</p>
                        <small>{{ order.pickupLocation }} · {{ order.updatedAt }}</small>
                        <button
                          type="button"
                          :disabled="props.disabled || order.status === 'picked_up' || order.status === 'cancelled'"
                          @click="pickupOrder(order)"
                        >
                          {{ order.status === 'picked_up' ? '已签收' : '取件/签收' }}
                        </button>
                      </article>
                      <p v-if="!orders.length" class="empty-copy">暂无订单。</p>
                    </div>
                  </section>
                </main>
              </div>

              <p v-if="feedback" class="phone-feedback">{{ feedback }}</p>
              <button class="phone-homebar" type="button" aria-label="回到手机桌面" @click="goHome"></button>
            </div>
          </div>
        </section>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped lang="scss">
.phone-launcher {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 72;
}

.phone-launcher__button {
  position: relative;
  width: 50px;
  height: 64px;
  padding: 5px;
  border: 2px solid rgba(32, 32, 36, 0.86);
  border-radius: 15px;
  background: linear-gradient(180deg, #1f2026, #07080d);
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.18);
  cursor: move;
  touch-action: none;
  user-select: none;
}

.phone-launcher__button--active,
.phone-launcher__button:hover {
  border-color: rgba(255, 125, 164, 0.8);
  box-shadow: 0 18px 36px rgba(255, 125, 164, 0.24), 0 0 0 3px rgba(255, 125, 164, 0.12);
}

.phone-launcher__screen {
  position: relative;
  display: grid;
  height: 100%;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  padding: 13px 5px 7px;
  border-radius: 10px;
  background:
    radial-gradient(circle at 72% 66%, rgba(255, 185, 211, 0.88), transparent 22%),
    linear-gradient(180deg, #f8fbff 0%, #fff6fb 64%, #ffdfea 100%);
  box-sizing: border-box;
}

.phone-launcher__screen::before {
  position: absolute;
  top: 5px;
  left: 50%;
  width: 16px;
  height: 3px;
  border-radius: 999px;
  background: rgba(20, 22, 28, 0.72);
  content: '';
  transform: translateX(-50%);
}

.phone-launcher__screen span {
  border-radius: 6px;
  background: linear-gradient(140deg, #ff8099, #ffe7ee);
  box-shadow: 0 1px 2px rgba(25, 25, 30, 0.18);
}

.phone-launcher__screen span:nth-child(2) {
  background: linear-gradient(140deg, #7fb2ff, #dfe9ff);
}

.phone-launcher__screen span:nth-child(3) {
  background: linear-gradient(140deg, #ffa44c, #ffe0ae);
}

.phone-launcher__badge,
.phone-app em {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border: 2px solid #fff;
  border-radius: 999px;
  background: #ff513f;
  color: #fff;
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 4px 10px rgba(255, 81, 63, 0.35);
}

.phone-launcher__badge {
  top: -8px;
  right: -8px;
}

.phone-overlay {
  position: fixed;
  inset: 0;
  z-index: 85;
  background: rgba(15, 17, 24, 0.16);
  backdrop-filter: blur(4px);
}

.phone-shell {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: min(360px, calc(100vw - 24px));
  max-height: min(740px, calc(100vh - 24px));
  box-sizing: border-box;
}

.phone-bezel {
  padding: 9px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 38px;
  background: linear-gradient(145deg, #1f2028, #07080d 48%, #2a2c35);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.46), inset 0 1px 1px rgba(255, 255, 255, 0.22);
}

.phone-display {
  position: relative;
  display: flex;
  height: min(720px, calc(100vh - 46px));
  max-height: 720px;
  min-height: 520px;
  flex-direction: column;
  overflow: hidden;
  border-radius: 30px;
  background:
    linear-gradient(rgba(255, 255, 255, 0.68), rgba(255, 255, 255, 0.78)),
    radial-gradient(circle at 35% 71%, rgba(255, 179, 205, 0.74) 0 18%, transparent 38%),
    radial-gradient(circle at 68% 77%, rgba(184, 218, 255, 0.54) 0 16%, transparent 35%),
    linear-gradient(180deg, #f4f7fb 0%, #ffffff 55%, #ffeaf2 100%);
  color: #20232d;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}

.phone-statusbar {
  position: relative;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  padding: 7px 20px 4px;
  color: #222630;
  cursor: grab;
  font-size: 14px;
  touch-action: none;
  user-select: none;
}

.phone-statusbar:active {
  cursor: grabbing;
}

.phone-statusbar strong {
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 0.02em;
}

.phone-statusbar__icons {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-weight: 800;
}

.phone-statusbar__icons i {
  font-size: 12px;
  font-style: normal;
}

.phone-notch {
  position: absolute;
  z-index: 5;
  top: 10px;
  left: 50%;
  width: 84px;
  height: 22px;
  border-radius: 999px;
  background: rgba(18, 19, 24, 0.92);
  box-shadow: inset 0 -1px 1px rgba(255, 255, 255, 0.16), 0 3px 8px rgba(0, 0, 0, 0.18);
  transform: translateX(-50%);
}

.phone-home-screen,
.phone-app-screen {
  position: relative;
  z-index: 2;
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.phone-home-screen {
  padding: 36px 22px 20px;
}

.phone-wallpaper-mark {
  display: flex;
  min-height: 230px;
  flex-direction: column;
  justify-content: flex-end;
  color: rgba(40, 43, 54, 0.22);
  pointer-events: none;
}

.phone-wallpaper-bunny {
  position: absolute;
  right: 30px;
  bottom: 126px;
  color: rgba(255, 151, 190, 0.2);
  font-size: 210px;
  font-weight: 900;
  line-height: 0.8;
  transform: rotate(-12deg);
}

.phone-wallpaper-mark strong {
  font-size: 34px;
  font-weight: 900;
  letter-spacing: 0.16em;
}

.phone-wallpaper-mark em {
  margin-top: 6px;
  font-size: 16px;
  font-style: normal;
  font-weight: 800;
  letter-spacing: 0.3em;
}

.phone-home-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 22px 18px;
  margin-top: 8px;
}

.phone-dock {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 38px;
  margin-top: auto;
  padding: 13px 42px 12px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 -4px 26px rgba(255, 165, 195, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
}

.phone-app {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #161923;
  cursor: pointer;
  font: inherit;
  text-align: center;
}

.phone-app__label {
  max-width: 76px;
  overflow: hidden;
  color: #161923;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}

.phone-app-picture {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  overflow: hidden;
  border: 3px solid rgba(255, 255, 255, 0.95);
  border-radius: 21px;
  background: #fff;
  box-shadow: 0 7px 12px rgba(22, 25, 35, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.phone-app-picture::before,
.phone-app-picture::after,
.phone-app-picture__glyph::before,
.phone-app-picture__glyph::after {
  position: absolute;
  content: '';
}

.phone-app-picture--small {
  width: 36px;
  height: 36px;
  border-width: 2px;
  border-radius: 12px;
  box-shadow: 0 4px 9px rgba(22, 25, 35, 0.18);
}

.phone-app-picture--contacts {
  background: linear-gradient(145deg, #ff94a7, #ffe6ee);
}

.phone-app-picture--contacts::before {
  width: 26px;
  height: 34px;
  border: 4px solid #222632;
  border-bottom-color: transparent;
  border-radius: 16px 16px 18px 18px;
  transform: rotate(-22deg);
}

.phone-app-picture--contacts::after {
  right: 8px;
  bottom: 6px;
  width: 20px;
  height: 20px;
  border: 3px solid #222632;
  border-radius: 50%;
  background: #b8f070;
}

.phone-app-picture--forum {
  background: linear-gradient(145deg, #6a6fff, #dce6ff);
}

.phone-app-picture--forum::before {
  width: 38px;
  height: 28px;
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 8px 0 -4px rgba(20, 23, 32, 0.34);
}

.phone-app-picture--forum::after {
  right: 12px;
  bottom: 14px;
  border-top: 9px solid #fff;
  border-left: 9px solid transparent;
}

.phone-app-picture--delivery {
  background: linear-gradient(145deg, #ff7b35, #ffe4ad);
}

.phone-app-picture--delivery::before {
  width: 38px;
  height: 30px;
  border: 4px solid #20232d;
  border-radius: 10px;
  background: #fff8e4;
}

.phone-app-picture--delivery::after {
  top: 17px;
  width: 23px;
  height: 5px;
  border-radius: 999px;
  background: #ff5f5f;
  box-shadow: 0 9px 0 #6cc8ff;
}

.phone-app-picture--tieba {
  background: linear-gradient(145deg, #78e9cf, #efffff);
}

.phone-app-picture--tieba::before {
  width: 34px;
  height: 34px;
  border: 4px solid #20232d;
  border-radius: 50% 50% 45% 55%;
  background: #cffff2;
}

.phone-app-picture--tieba::after {
  right: 10px;
  bottom: 10px;
  width: 18px;
  height: 12px;
  border-radius: 8px;
  background: #ff5b70;
  transform: rotate(-22deg);
}

.phone-app-picture--taobao {
  background: linear-gradient(145deg, #ff8c2f, #fff0d7);
}

.phone-app-picture--taobao::before {
  width: 34px;
  height: 38px;
  border-radius: 9px 9px 13px 13px;
  background: #ff6b2b;
  box-shadow: inset 0 -12px 0 rgba(255, 255, 255, 0.22);
}

.phone-app-picture--taobao::after {
  top: 15px;
  width: 18px;
  height: 10px;
  border: 3px solid #fff;
  border-bottom: 0;
  border-radius: 12px 12px 0 0;
}

.phone-app-picture--orders {
  background: linear-gradient(145deg, #f7fbff, #dde8ff);
}

.phone-app-picture--orders::before {
  width: 42px;
  height: 42px;
  border: 4px solid #20232d;
  border-radius: 50%;
  background: linear-gradient(180deg, #ff5f6f 0 45%, #20232d 45% 55%, #fff 55% 100%);
}

.phone-app-picture--orders::after {
  width: 13px;
  height: 13px;
  border: 3px solid #20232d;
  border-radius: 50%;
  background: #fff;
}

.phone-app em {
  top: -8px;
  right: 2px;
}

.phone-app-header {
  display: grid;
  grid-template-columns: 32px 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 8px 14px 10px;
  border-bottom: 1px solid rgba(31, 35, 47, 0.08);
  background: rgba(255, 255, 255, 0.58);
  backdrop-filter: blur(14px);
}

.phone-app-header button {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.78);
  color: #20232d;
  cursor: pointer;
  font-size: 26px;
  line-height: 1;
}

.phone-app-header div {
  min-width: 0;
}

.phone-app-header strong,
.phone-app-header small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.phone-app-header strong {
  font-size: 16px;
  font-weight: 900;
}

.phone-app-header small,
.phone-app-header em {
  color: #737985;
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
}

.phone-screen {
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background: rgba(250, 252, 255, 0.7);
}

.phone-view {
  height: 100%;
  padding: 12px;
  overflow-y: auto;
  box-sizing: border-box;
}

.phone-view--contacts {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.contact-list {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.contact-pill {
  display: inline-flex;
  min-width: 86px;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border: 0;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  color: #454a57;
  cursor: pointer;
  box-shadow: 0 5px 14px rgba(35, 40, 55, 0.08);
}

.contact-pill--active {
  background: #ffebf2;
  color: #e34d79;
}

.contact-pill span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: linear-gradient(145deg, #ff9bb1, #fff2f6);
  color: #20232d;
  font-weight: 900;
}

.contact-pill strong {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-panel {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 12px 28px rgba(35, 40, 55, 0.08);
}

.chat-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 13px;
  border-bottom: 1px solid rgba(31, 35, 47, 0.08);
  color: #8a909c;
  font-size: 12px;
}

.chat-panel__header--detail {
  justify-content: flex-start;
}

.chat-panel__header div {
  min-width: 0;
}

.chat-panel__header span,
.chat-panel__header strong {
  display: block;
}

.chat-panel__header strong {
  color: #20232d;
}

.chat-panel__back,
.chat-panel__memory-trigger {
  flex: 0 0 auto;
  padding: 7px 12px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 121, 150, 0.12);
  color: #b13f6b;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
}

.private-memory-detail {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  overflow-y: auto;
}

.private-memory-detail__meta {
  margin: 0;
  color: #8d94a2;
  font-size: 11px;
}

.private-memory-section {
  display: grid;
  gap: 6px;
  padding: 11px 12px;
  border-radius: 18px;
  background: rgba(255, 248, 251, 0.92);
  box-shadow: inset 0 0 0 1px rgba(255, 121, 150, 0.08);
}



.private-memory-section h4,
.private-memory-section p,
.private-memory-section ol {
  margin: 0;
}

.private-memory-section p {
  margin: 0;
  color: #4c5261;
  font-size: 12px;
  line-height: 1.55;
}

.private-memory-list li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.private-memory-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-size: 12px;
  line-height: 1;
}

.private-memory-status--completed {
  color: #19a44b;
}

.private-memory-status--failed {
  color: #db3d3d;
}

.private-memory-status--pending {
  color: #8d94a2;
}

.private-memory-text {
  min-width: 0;
  color: #4c5261;
  font-size: 12px;
  line-height: 1.55;
}

.private-memory-section ol {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 0;
  list-style: none;
}



.message-list,
.catalog-list,
.order-list,
.feed-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.message-list {
  min-height: 0;
  flex: 1;
  padding: 12px;
  overflow-y: auto;
}

.message-bubble {
  max-width: 86%;
  padding: 9px 11px;
  border-radius: 17px;
  color: #20232d;
  box-shadow: 0 4px 12px rgba(35, 40, 55, 0.07);
}

.message-bubble p,
.feed-card p,
.catalog-card p,
.order-card p {
  margin: 0;
  color: #4c5261;
  font-size: 12px;
  line-height: 1.55;
}

.message-bubble span,
.feed-card span,
.order-card span,
.catalog-card small,
.order-card small {
  color: #8d94a2;
  font-size: 11px;
}

.message-bubble--out {
  align-self: flex-end;
  border-bottom-right-radius: 6px;
  background: #9ee7a8;
}

.message-bubble--in,
.message-bubble--system {
  align-self: flex-start;
  border-bottom-left-radius: 6px;
  background: #fff;
}

.phone-compose,
.feed-composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message-bubble--typing {
  border: 1px dashed rgba(255, 111, 145, 0.4);
  background: rgba(255, 235, 241, 0.95);
}

.phone-compose {
  padding: 10px;
  border-top: 1px solid rgba(31, 35, 47, 0.08);
}

.phone-compose textarea,
.feed-composer textarea,
.feed-composer input {
  width: 100%;
  border: 1px solid rgba(31, 35, 47, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.82);
  color: #20232d;
  resize: vertical;
  box-sizing: border-box;
  outline: none;
}

.phone-compose textarea,
.feed-composer textarea {
  padding: 9px;
}

.feed-composer {
  margin-bottom: 11px;
  padding: 12px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 8px 22px rgba(35, 40, 55, 0.08);
}

.feed-composer input {
  padding: 8px 10px;
}

.phone-compose button,
.feed-composer button,
.catalog-card button,
.order-card button {
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, #ff7896, #ff9e63);
  color: #fff;
  cursor: pointer;
  font-weight: 900;
  box-shadow: 0 7px 14px rgba(255, 120, 150, 0.24);
}

.phone-compose button,
.feed-composer button {
  padding: 9px 10px;
}

.phone-compose button:disabled,
.feed-composer button:disabled,
.catalog-card button:disabled,
.order-card button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.catalog-card,
.order-card,
.feed-card {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 8px 22px rgba(35, 40, 55, 0.08);
}

.catalog-card {
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
}

.catalog-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 16px;
  background: linear-gradient(145deg, #fff, #ffeaf0);
  font-size: 24px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 5px 12px rgba(35, 40, 55, 0.08);
}

.catalog-card__body {
  min-width: 0;
}

.catalog-card__title,
.order-card > div,
.feed-card > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.catalog-card__title strong,
.order-card strong,
.feed-card strong {
  color: #20232d;
}

.catalog-card__title span {
  color: #ff6b42;
  font-weight: 900;
}

.catalog-card button,
.order-card button {
  grid-column: 1 / -1;
  padding: 9px 10px;
  white-space: nowrap;
}

.empty-copy,
.phone-feedback {
  margin: 0;
  color: #8a909c;
  font-size: 12px;
}

.phone-feedback {
  position: absolute;
  z-index: 6;
  right: 18px;
  bottom: 22px;
  left: 18px;
  padding: 9px 12px;
  border-radius: 16px;
  background: rgba(32, 35, 45, 0.82);
  color: #fff;
  text-align: center;
  backdrop-filter: blur(12px);
}

.phone-homebar {
  position: relative;
  z-index: 7;
  width: 102px;
  height: 5px;
  flex: 0 0 auto;
  margin: 8px auto 10px;
  border: 0;
  border-radius: 999px;
  background: rgba(32, 35, 45, 0.28);
  cursor: pointer;
}

.phone-pop-enter-active,
.phone-pop-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.phone-pop-enter-from,
.phone-pop-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

@media (max-width: 620px) {
  .phone-launcher {
    right: 12px;
    bottom: 12px;
  }

  .phone-shell {
    right: 10px;
    bottom: 10px;
    width: min(348px, calc(100vw - 20px));
    max-height: calc(100vh - 20px);
  }

  .phone-bezel {
    padding: 7px;
    border-radius: 34px;
  }

  .phone-display {
    height: min(704px, calc(100vh - 34px));
    min-height: 500px;
    border-radius: 27px;
  }

  .phone-home-screen {
    padding: 32px 17px 18px;
  }

  .phone-home-grid {
    gap: 18px 12px;
  }

  .phone-app-picture {
    width: 58px;
    height: 58px;
    border-radius: 19px;
  }

  .phone-app-picture--small {
    width: 34px;
    height: 34px;
    border-radius: 12px;
  }

  .phone-dock {
    gap: 28px;
    padding-inline: 38px;
  }

  .phone-wallpaper-mark {
    min-height: 205px;
  }

  .phone-wallpaper-bunny {
    right: 14px;
    bottom: 120px;
    font-size: 180px;
  }
}
</style>
