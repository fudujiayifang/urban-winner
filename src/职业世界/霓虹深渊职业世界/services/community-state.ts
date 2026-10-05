import _ from 'lodash';

import type {
  CommunityComment,
  CommunityInboxItem,
  CommunityReactionKind,
  CommunityReactionSummary,
  CommunityThreadNode,
  GameState,
  PhoneFeedPost,
  PhoneState,
} from '../schema';

export type CommunityApp = 'forum' | 'tieba';

export const COMMUNITY_PLAYER_AUTHOR = '谢自国';
export const COMMUNITY_MAX_DEPTH = 6;
export const COMMUNITY_MIGRATION_VERSION = 2;
const COMMUNITY_HANDLE_OBJECTS = ['锅盖', '半根薯条', '拖鞋', '电饭煲', '塑料袋', '豆腐脑', '井盖', '酸黄瓜', '充电线', '小饼干', '饭勺', '纸箱', '咸鱼', '煎蛋', '搓澡巾', '奶茶盖', '键盘', '洗衣机', '袜子', '泡面', '蚊子', '剩饭', '保温杯', '脑瓜', '土豆', '门把手', '炸串', '遥控器', '鸡翅', '冰箱灯', '充电宝', '香菜'];
const COMMUNITY_HANDLE_ACTIONS = ['在逃', '漏电', '滑跪', '上号', '卡住了', '已读乱回', '偷着乐', '当场掉线', '突然摆烂', '反向开窍', '气成方的', '失去耐心', '又整这出', '忘了呼吸', '蹲个后续', '先睡为敬', '原地转圈', '不太服气', '偷偷叛逆', '有点耳背', '拒绝开机', '到处认亲', '申请散架', '正在缓冲'];
const COMMUNITY_HANDLE_STARTS = ['不是哥们', '我寻思', '别管了', '谁懂啊', '算我求你', '等会儿啊', '好好好', '咋又是', '哎不是', '你先别', '救一下', '给我整个', '这合理吗', '就这还', '我嘞个', '俺也想要'];
const COMMUNITY_HANDLE_ENDINGS = ['也算工伤', '但没完全', '罢了罢了', '暂时健在', '本人不在', '啊对对对', '咋回事捏', '先欠着吧', '这谁顶得住', '你礼貌吗', '那咋了', '也是绝了', '但我没电', '就当我赢了', '我装的', '随便吧呜'];
const COMMUNITY_HANDLE_BITS = ['oops', 'hhh', 'orz', 'ovo', '404', 'loading', 'yyds', 'emmm', 'ok啊', '摆烂.exe', '咕咕', '嘀嘀', '吨吨', '啊这', '嗯嗯', '呃呃'];

function hashCommunityValue(identity: string): number {
  let hash = 2166136261;
  for (const character of identity) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

function pickCommunityPart(parts: string[]): string {
  return parts[Math.floor(Math.random() * parts.length)];
}

export function getCommunityHandle(_identity: string): string {
  const style = Math.floor(Math.random() * 4);
  if (style === 0) {
    return `${pickCommunityPart(COMMUNITY_HANDLE_STARTS)}${pickCommunityPart(COMMUNITY_HANDLE_OBJECTS)}${pickCommunityPart(COMMUNITY_HANDLE_ENDINGS)}`;
  }
  if (style === 1) {
    return `${pickCommunityPart(COMMUNITY_HANDLE_OBJECTS)}${pickCommunityPart(COMMUNITY_HANDLE_ACTIONS)}`;
  }
  if (style === 2) {
    return `${pickCommunityPart(COMMUNITY_HANDLE_ACTIONS)}的${pickCommunityPart(COMMUNITY_HANDLE_OBJECTS)}`;
  }
  return `${pickCommunityPart(COMMUNITY_HANDLE_OBJECTS)}${pickCommunityPart(COMMUNITY_HANDLE_BITS)}`;
}


function stripCommunityControlCharacters(value: string): string {
  return Array.from(value).filter(character => {
    const code = character.charCodeAt(0);
    return code > 0x1f && code !== 0x7f;
  }).join('');
}

export function normalizeCommunityAuthor(author: unknown, identity: string): string {
  const value = typeof author === 'string'
    ? stripCommunityControlCharacters(author).replace(/\s+/g, ' ').trim().slice(0, 32)
    : '';
  if (value === COMMUNITY_PLAYER_AUTHOR) {
    return value;
  }
  if (value && !/^(?:匿名用户|匿名|unknown|user|游客|机器人)$/iu.test(value)) {
    return value;
  }

  return getCommunityHandle(identity);
}

export function stableCommunityId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${hashCommunityValue(parts.map(part => normalizeCommunityText(part, 320)).join('|')).toString(36)}`;
}

export function getCommunityLikeBaseline(identity: string, kind: 'post' | 'node'): number {
  const value = hashCommunityValue(`likes:v1:${kind}:${identity}`);
  return kind === 'post' ? 3 + (value % 10) : 1 + (value % 4);
}
export const COMMUNITY_MAX_POSTS = 60;
export const COMMUNITY_MAX_INBOX = 120;
export const COMMUNITY_MAX_TOP_LEVEL_COMMENTS = 18;
export const COMMUNITY_MAX_REPLIES_PER_NODE = 8;
export const COMMUNITY_MAX_TEXT_LENGTH = 160;

export function limitCommunityNodes(nodes: CommunityThreadNode[], limit: number): CommunityThreadNode[] {
  if (nodes.length <= limit) {
    return nodes;
  }

  const selected = new Set<CommunityThreadNode>();
  nodes.forEach(node => {
    if (node.author === COMMUNITY_PLAYER_AUTHOR && selected.size < limit) {
      selected.add(node);
    }
  });

  for (const node of [...nodes].reverse()) {
    if (selected.size >= limit) {
      break;
    }
    selected.add(node);
  }

  return nodes.filter(node => selected.has(node));
}

export interface CommunityDerivedStats {
  following: number;
  followers: number;
  receivedLikes: number;
  myPosts: PhoneFeedPost[];
}

function createCommunityId(prefix: string): string {
  return _.uniqueId(`${prefix}-`);
}

export function isCommunityReactionKind(value: unknown): value is CommunityReactionKind {
  return value === 'like';
}

export function normalizeCommunityText(value: string, limit = COMMUNITY_MAX_TEXT_LENGTH): string {
  return stripCommunityControlCharacters(value).replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function prepareCommunityInputForSchema(value: unknown): unknown {
  if (!_.isPlainObject(value) && !Array.isArray(value)) {
    return value;
  }

  const next = _.cloneDeep(value) as Record<string, unknown> | unknown[];
  const visit = (current: Record<string, unknown> | unknown[]): void => {
    if (Array.isArray(current)) {
      for (const item of current) {
        if (_.isPlainObject(item) || Array.isArray(item)) {
          visit(item as Record<string, unknown> | unknown[]);
        }
      }
      return;
    }

    for (const [key, child] of Object.entries(current)) {
      if (key === 'reactions' && _.isPlainObject(child)) {
        delete (child as Record<string, unknown>).dislike;
      }
      if (key === 'playerReaction' && child === 'dislike') {
        current[key] = null;
      }
      if (_.isPlainObject(child) || Array.isArray(child)) {
        visit(child as Record<string, unknown> | unknown[]);
      }
    }
  };

  visit(next);
  if (_.isPlainObject(next)) {
    const phone = _.get(next, '零七系统.手机') as Record<string, unknown> | undefined;
    if (phone && Array.isArray(phone.communityInbox)) {
      phone.communityInbox = phone.communityInbox.filter(item => !(_.isPlainObject(item) && item.type === 'dislike'));
    }
  }
  return next;
}

export function migrateCommunityHandles(state: GameState): boolean {
  const phone = state.零七系统.手机;
  if (phone.communityConfig.communityMigrationVersion >= COMMUNITY_MIGRATION_VERSION) {
    return false;
  }

  const handles = new Map<string, string>();
  const used = new Set<string>([COMMUNITY_PLAYER_AUTHOR]);
  const resolveHandle = (author: string, identity: string): string => {
    if (author === COMMUNITY_PLAYER_AUTHOR) {
      return author;
    }
    const existing = handles.get(author);
    if (existing) {
      return existing;
    }
    let next = getCommunityHandle(identity);
    for (let attempt = 0; used.has(next) && attempt < 8; attempt += 1) {
      next = getCommunityHandle(identity);
    }
    if (used.has(next)) {
      const base = next;
      let suffix = 2;
      while (used.has(`${base}${suffix}`)) {
        suffix += 1;
      }
      next = `${base}${suffix}`;
    }
    used.add(next);
    handles.set(author, next);
    return next;
  };

  for (const post of phone.动态记录) {
    if (post.author !== COMMUNITY_PLAYER_AUTHOR) {
      post.author = resolveHandle(post.author, `post:${post.id}`);
    }
    walkCommunityNodes(post.comments, node => {
      if (node.author !== COMMUNITY_PLAYER_AUTHOR) {
        node.author = resolveHandle(node.author, `node:${node.id}`);
      }
    });
  }
  for (const item of phone.communityInbox) {
    if (item.actor !== COMMUNITY_PLAYER_AUTHOR) {
      item.actor = resolveHandle(item.actor, `inbox:${item.id}`);
    }
  }

  phone.communityConfig.communityMigrationVersion = COMMUNITY_MIGRATION_VERSION;
  return true;
}

export function migrateCommunityLikes(state: GameState): boolean {
  const phone = state.零七系统.手机;
  if (phone.communityConfig.communityMigrationVersion >= 1) {
    return false;
  }

  for (const post of phone.动态记录) {
    if (post.author !== COMMUNITY_PLAYER_AUTHOR && post.reactions.like === 0) {
      post.reactions.like = getCommunityLikeBaseline(post.id, 'post');
    }
    walkCommunityNodes(post.comments, node => {
      if (node.author !== COMMUNITY_PLAYER_AUTHOR && node.reactions.like === 0) {
        node.reactions.like = getCommunityLikeBaseline(node.id, 'node');
      }
    });
  }
  phone.communityConfig.communityMigrationVersion = 1;
  return true;
}

function normalizeDisplayText(value: string, limit: number): string {
  return normalizeCommunityText(value, limit);
}

export function normalizeForumCategory(value: string): string {
  const text = normalizeCommunityText(value, 24);
  if (!text) {
    return '广场';
  }

  if (/(官方|平台|委托|任务|招募|公告|派单|发布)/.test(text)) {
    return '委托';
  }

  if (/(求助|情报|资源|讨论|闲聊|广场|交流)/.test(text)) {
    return '广场';
  }

  return text;
}

export function normalizeCommunityReactionSummary(value: unknown): CommunityReactionSummary {
  const record = _.isPlainObject(value) ? (value as Record<string, unknown>) : {};
  const rawLike = Number(record.like ?? 0);
  return {
    like: Number.isFinite(rawLike) ? Math.min(999_999, Math.max(0, Math.trunc(rawLike))) : 0,
  };
}

export function createEmptyCommunityReactions(): CommunityReactionSummary {
  return {
    like: 0,
  };
}

export function createEmptyCommunityNode(at = '', depth = 1): CommunityThreadNode {
  return {
    id: '',
    author: normalizeCommunityAuthor(``, `draft-${at}-${depth}`),
    body: '',
    at,
    depth,
    reactions: createEmptyCommunityReactions(),
    playerReaction: null,
    replies: [],
  };
}

export function normalizeCommunityThreadNode(value: unknown, currentDepth = 1, fallbackAt = ''): CommunityThreadNode | null {
  if (!_.isPlainObject(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const body = typeof record.body === 'string' ? normalizeCommunityText(record.body) : '';
  if (!body) {
    return null;
  }

  const depth = _.clamp(Math.trunc(Number(record.depth ?? currentDepth) || currentDepth), 1, COMMUNITY_MAX_DEPTH);
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : createCommunityId(`node-${depth}`);
  const replies = depth >= COMMUNITY_MAX_DEPTH || !Array.isArray(record.replies)
    ? []
    : record.replies
      .map(reply => normalizeCommunityThreadNode(reply, depth + 1, fallbackAt))
      .filter((reply): reply is CommunityThreadNode => Boolean(reply))
      .slice(-COMMUNITY_MAX_REPLIES_PER_NODE);

  return {
    id,
    author: record.author === COMMUNITY_PLAYER_AUTHOR ? COMMUNITY_PLAYER_AUTHOR : normalizeCommunityAuthor(record.author, id),
    body: normalizeDisplayText(body, COMMUNITY_MAX_TEXT_LENGTH),
    at: typeof record.at === 'string' && record.at.trim() ? record.at.trim() : fallbackAt,
    depth,
    reactions: normalizeCommunityReactionSummary(record.reactions),
    playerReaction: record.playerReaction === 'like' ? 'like' : null,
    replies,
  };
}

export function normalizeCommunityInboxItem(value: unknown, fallbackAt = ''): CommunityInboxItem | null {
  if (!_.isPlainObject(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const rawActor = typeof record.actor === 'string' ? normalizeCommunityText(record.actor, 32) : '';
  if (rawActor === COMMUNITY_PLAYER_AUTHOR) {
    return null;
  }
  const summary = typeof record.summary === 'string' ? normalizeDisplayText(record.summary, COMMUNITY_MAX_TEXT_LENGTH) : '';
  if (!summary) {
    return null;
  }

  const app = record.app === 'forum' || record.app === 'tieba' ? record.app : record.app == null ? 'forum' : null;
  const type = record.type === 'comment'
    || record.type === 'reply'
    || record.type === 'like'
    || record.type === 'mention'
    || record.type === 'dm'
    ? record.type
    : null;
  if (!app || !type) {
    return null;
  }

  const actor = normalizeCommunityAuthor(record.actor, typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `${app}-${summary}`);
  if (actor === COMMUNITY_PLAYER_AUTHOR) {
    return null;
  }

  const nodeId = typeof record.nodeId === 'string' && record.nodeId.trim()
    ? record.nodeId.trim()
    : typeof record.replyId === 'string' && record.replyId.trim()
      ? record.replyId.trim()
      : typeof record.commentId === 'string' && record.commentId.trim()
        ? record.commentId.trim()
        : '';

  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : createCommunityId(`inbox-${app}`),
    app,
    type,
    actor,
    summary,
    at: typeof record.at === 'string' && record.at.trim() ? record.at.trim() : fallbackAt,
    read: Boolean(record.read),
    postId: typeof record.postId === 'string' ? record.postId : '',
    nodeId,
    commentId: typeof record.commentId === 'string' ? record.commentId : '',
    replyId: typeof record.replyId === 'string' ? record.replyId : '',
  };
}

export function normalizeCommunityPost(value: unknown): PhoneFeedPost | null {
  if (!_.isPlainObject(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : '';
  const title = typeof record.title === 'string' ? normalizeCommunityText(record.title, 64) : '';
  const body = typeof record.body === 'string' ? normalizeCommunityText(record.body, 220) : '';
  if (!id || !title || !body) {
    return null;
  }

  const app = record.app === 'forum' || record.app === 'tieba' ? record.app : 'forum';
  const at = typeof record.at === 'string' && record.at.trim() ? record.at.trim() : '';
  const comments = Array.isArray(record.comments)
    ? record.comments
      .map(comment => normalizeCommunityThreadNode(comment, 1, at))
      .filter((comment): comment is CommunityComment => Boolean(comment))
      .slice(-COMMUNITY_MAX_TOP_LEVEL_COMMENTS)
    : [];
  const rawCategory = typeof record.category === 'string' ? normalizeCommunityText(record.category, 24) : '';

  return {
    id,
    app,
    author: record.author === COMMUNITY_PLAYER_AUTHOR ? COMMUNITY_PLAYER_AUTHOR : normalizeCommunityAuthor(record.author, id),
    title: normalizeDisplayText(title, 64),
    body: normalizeDisplayText(body, 220),
    at,
    category: app === 'forum' ? normalizeForumCategory(rawCategory) : rawCategory,
    lastActivityAt: typeof record.lastActivityAt === 'string' && record.lastActivityAt.trim() ? record.lastActivityAt.trim() : at,
    reactions: normalizeCommunityReactionSummary(record.reactions),
    playerReaction: record.playerReaction === 'like' ? 'like' : null,
    comments: limitCommunityNodes(comments, COMMUNITY_MAX_TOP_LEVEL_COMMENTS).map(trimCommunityThreadNode),
  };
}

export function trimCommunityThreadNode(node: CommunityThreadNode): CommunityThreadNode {
  const depth = _.clamp(node.depth || 1, 1, COMMUNITY_MAX_DEPTH);
  return {
    ...node,
    depth,
    body: normalizeCommunityText(node.body),
    replies: depth >= COMMUNITY_MAX_DEPTH
      ? []
      : limitCommunityNodes(node.replies, COMMUNITY_MAX_REPLIES_PER_NODE).map((reply: CommunityThreadNode) => trimCommunityThreadNode({
          ...reply,
          depth: _.clamp(reply.depth || depth + 1, depth + 1, COMMUNITY_MAX_DEPTH),
        })),
  };
}

export function trimCommunityPost(post: PhoneFeedPost): PhoneFeedPost {
  return {
    ...post,
    title: normalizeCommunityText(post.title, 64),
    body: normalizeCommunityText(post.body, 220),
    category: normalizeCommunityText(post.category, 24),
    comments: limitCommunityNodes(post.comments, COMMUNITY_MAX_TOP_LEVEL_COMMENTS).map(trimCommunityThreadNode),
  };
}

export function normalizePhoneCommunityState(phone: PhoneState): PhoneState {
  phone.communityConfig = {
    forumEnabled: Boolean(phone.communityConfig?.forumEnabled),
    tiebaEnabled: Boolean(phone.communityConfig?.tiebaEnabled),
    communityMigrationVersion: Math.max(0, Math.trunc(Number(phone.communityConfig?.communityMigrationVersion) || 0)),
  };

  phone.communityInbox = phone.communityInbox
    .map(item => normalizeCommunityInboxItem(item, item?.at ?? ''))
    .filter((item): item is CommunityInboxItem => Boolean(item))
    .slice(-COMMUNITY_MAX_INBOX);

  const seenPostIds = new Set<string>();
  phone.动态记录 = phone.动态记录
    .map(post => normalizeCommunityPost(post))
    .filter((post): post is PhoneFeedPost => Boolean(post))
    .filter(post => {
      if (seenPostIds.has(post.id)) {
        return false;
      }
      seenPostIds.add(post.id);
      return true;
    })
    .sort((left, right) => left.lastActivityAt.localeCompare(right.lastActivityAt))
    .slice(-COMMUNITY_MAX_POSTS)
    .map(trimCommunityPost);

  return phone;
}

export function normalizeGameCommunityState(state: GameState): GameState {
  normalizePhoneCommunityState(state.零七系统.手机);
  return state;
}

export function countCommunityNodes(nodes: CommunityThreadNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countCommunityNodes(node.replies), 0);
}

export function walkCommunityNodes(nodes: CommunityThreadNode[], visitor: (node: CommunityThreadNode) => void): void {
  for (const node of nodes) {
    visitor(node);
    walkCommunityNodes(node.replies, visitor);
  }
}

export function findCommunityNode(nodes: CommunityThreadNode[], nodeId: string): CommunityThreadNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    const child = findCommunityNode(node.replies, nodeId);
    if (child) {
      return child;
    }
  }
  return null;
}

export function appendCommunityReplyToNode(post: PhoneFeedPost, targetNodeId: string, body: string, author: string, at: string): CommunityThreadNode | null {
  const parent = findCommunityNode(post.comments, targetNodeId);
  if (!parent || parent.depth >= COMMUNITY_MAX_DEPTH) {
    return null;
  }

  const reply: CommunityThreadNode = {
    ...createEmptyCommunityNode(at, parent.depth + 1),
    id: createCommunityId(`reply-${post.app}`),
    author,
    body: normalizeCommunityText(body),
    at,
  };
  parent.replies.push(reply);
  post.lastActivityAt = at;
  return reply;
}

export function appendCommunityComment(post: PhoneFeedPost, body: string, author: string, at: string): CommunityThreadNode {
  const comment: CommunityThreadNode = {
    ...createEmptyCommunityNode(at, 1),
    id: createCommunityId(`comment-${post.app}`),
    author,
    body: normalizeCommunityText(body),
    at,
  };
  post.comments.push(comment);
  post.lastActivityAt = at;
  return comment;
}

export function applyCommunityReaction(summary: CommunityReactionSummary, current: CommunityReactionKind | null, next: CommunityReactionKind | null): CommunityReactionKind | null {
  if (current === next) {
    return current;
  }

  if (current === 'like') {
    summary.like = Math.max(0, summary.like - 1);
  }
  if (next === 'like') {
    summary.like += 1;
  }
  return next;
}

export function shouldCreateInboxForInteraction(targetAuthor: string, actor: string): boolean {
  return targetAuthor === COMMUNITY_PLAYER_AUTHOR && actor !== COMMUNITY_PLAYER_AUTHOR;
}

export function createCommunityInboxItem(options: {
  app: CommunityApp;
  type: CommunityInboxItem['type'];
  actor: string;
  summary: string;
  at: string;
  postId?: string;
  nodeId?: string;
  commentId?: string;
  replyId?: string;
}): CommunityInboxItem | null {
  const actor = normalizeCommunityText(options.actor, 32);
  const summary = normalizeCommunityText(options.summary);
  if (!actor || !summary || actor === COMMUNITY_PLAYER_AUTHOR) {
    return null;
  }

  return {
    id: createCommunityId(`inbox-${options.app}`),
    app: options.app,
    type: options.type,
    actor,
    summary,
    at: options.at,
    read: false,
    postId: options.postId ?? '',
    nodeId: options.nodeId ?? options.replyId ?? options.commentId ?? '',
    commentId: options.commentId ?? '',
    replyId: options.replyId ?? '',
  };
}

export function appendCommunityInbox(phone: PhoneState, item: CommunityInboxItem | null): void {
  if (!item) {
    return;
  }
  const exists = phone.communityInbox.some(entry => entry.id === item.id);
  if (!exists) {
    phone.communityInbox.push(item);
  }
}

export function deriveCommunityStats(phone: PhoneState, app: CommunityApp): CommunityDerivedStats {
  const myPosts = phone.动态记录.filter(post => post.app === app && post.author === COMMUNITY_PLAYER_AUTHOR);
  const following = new Set<string>();
  const followers = new Set<string>();
  let receivedLikes = 0;

  for (const post of phone.动态记录.filter(item => item.app === app)) {
    if (post.author === COMMUNITY_PLAYER_AUTHOR) {
      receivedLikes += post.reactions.like;
    }
    if (post.playerReaction && post.author !== COMMUNITY_PLAYER_AUTHOR) {
      following.add(post.author);
    }

    walkCommunityNodes(post.comments, node => {
      if (node.author === COMMUNITY_PLAYER_AUTHOR) {
        receivedLikes += node.reactions.like;
      }
      if (node.playerReaction && node.author !== COMMUNITY_PLAYER_AUTHOR) {
        following.add(node.author);
      }
      if (post.author === COMMUNITY_PLAYER_AUTHOR && node.author !== COMMUNITY_PLAYER_AUTHOR) {
        followers.add(node.author);
      }
      if (node.author === COMMUNITY_PLAYER_AUTHOR) {
        walkCommunityNodes(node.replies, reply => {
          if (reply.author !== COMMUNITY_PLAYER_AUTHOR) {
            followers.add(reply.author);
          }
        });
      }
    });
  }

  for (const item of phone.communityInbox) {
    if (item.app !== app || item.actor === COMMUNITY_PLAYER_AUTHOR) {
      continue;
    }
    followers.add(item.actor);
  }

  return {
    following: following.size,
    followers: followers.size,
    receivedLikes,
    myPosts,
  };
}

export function summarizeCommunityNode(node: CommunityThreadNode, depthLimit = 2, childLimit = 3): Record<string, unknown> {
  return {
    id: node.id,
    author: node.author,
    body: node.body.slice(0, 80),
    at: node.at,
    depth: node.depth,
    reactions: node.reactions,
    replies: depthLimit <= 1
      ? []
      : node.replies.slice(-childLimit).map((reply: CommunityThreadNode) => summarizeCommunityNode(reply, depthLimit - 1, childLimit)),
  };
}
