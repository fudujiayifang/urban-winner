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
const COMMUNITY_HANDLE_PREFIXES = ['薄荷', '夜航', '青柠', '折纸', '雾灯', '星尘', '短波', '云雀', '回声', '木槿', '灰鲸', '风铃'];
const COMMUNITY_HANDLE_SUFFIXES = ['汽水', '旅人', '电波', '信使', '观察员', '拾荒者', '维修员', '探路者', '收藏家', '小队长', '记录者', '守夜人'];

export function getCommunityHandle(identity: string): string {
  let hash = 2166136261;
  for (const character of identity) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  const value = hash >>> 0;
  return `${COMMUNITY_HANDLE_PREFIXES[value % COMMUNITY_HANDLE_PREFIXES.length]}${COMMUNITY_HANDLE_SUFFIXES[Math.floor(value / COMMUNITY_HANDLE_PREFIXES.length) % COMMUNITY_HANDLE_SUFFIXES.length]}`;
}

function normalizeCommunityAuthor(author: unknown, identity: string): string {
  const value = typeof author === 'string' ? author.trim() : '';
  return value === COMMUNITY_PLAYER_AUTHOR ? value : getCommunityHandle(identity);
}
export const COMMUNITY_MAX_POSTS = 60;
export const COMMUNITY_MAX_INBOX = 120;
export const COMMUNITY_MAX_TOP_LEVEL_COMMENTS = 18;
export const COMMUNITY_MAX_REPLIES_PER_NODE = 8;
export const COMMUNITY_MAX_TEXT_LENGTH = 160;

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
  return value === 'like' || value === 'dislike';
}

export function normalizeCommunityText(value: string, limit = COMMUNITY_MAX_TEXT_LENGTH): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function normalizeDisplayText(value: string, limit: number): string {
  return normalizeCommunityText(value.replace(/匿名用户/g, '薄荷汽水'), limit);
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
  return {
    like: Math.max(0, Math.trunc(Number(record.like ?? 0) || 0)),
    dislike: Math.max(0, Math.trunc(Number(record.dislike ?? 0) || 0)),
  };
}

export function createEmptyCommunityReactions(): CommunityReactionSummary {
  return {
    like: 0,
    dislike: 0,
  };
}

export function createEmptyCommunityNode(at = '', depth = 1): CommunityThreadNode {
  return {
    id: '',
    author: getCommunityHandle(`draft-${at}-${depth}`),
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
    author: normalizeCommunityAuthor(record.author, id),
    body: normalizeDisplayText(body, COMMUNITY_MAX_TEXT_LENGTH),
    at: typeof record.at === 'string' && record.at.trim() ? record.at.trim() : fallbackAt,
    depth,
    reactions: normalizeCommunityReactionSummary(record.reactions),
    playerReaction: isCommunityReactionKind(record.playerReaction) ? record.playerReaction : null,
    replies,
  };
}

export function normalizeCommunityInboxItem(value: unknown, fallbackAt = ''): CommunityInboxItem | null {
  if (!_.isPlainObject(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const summary = typeof record.summary === 'string' ? normalizeDisplayText(record.summary, COMMUNITY_MAX_TEXT_LENGTH) : '';
  if (!summary) {
    return null;
  }

  const app = record.app === 'forum' || record.app === 'tieba' ? record.app : record.app == null ? 'forum' : null;
  const type = record.type === 'comment'
    || record.type === 'reply'
    || record.type === 'like'
    || record.type === 'dislike'
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
    author: normalizeCommunityAuthor(record.author, id),
    title: normalizeDisplayText(title, 64),
    body: normalizeDisplayText(body, 220),
    at,
    category: app === 'forum' ? normalizeForumCategory(rawCategory) : rawCategory,
    lastActivityAt: typeof record.lastActivityAt === 'string' && record.lastActivityAt.trim() ? record.lastActivityAt.trim() : at,
    reactions: normalizeCommunityReactionSummary(record.reactions),
    playerReaction: isCommunityReactionKind(record.playerReaction) ? record.playerReaction : null,
    comments: comments.map(trimCommunityThreadNode),
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
      : node.replies.slice(-COMMUNITY_MAX_REPLIES_PER_NODE).map((reply: CommunityThreadNode) => trimCommunityThreadNode({
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
    comments: post.comments.slice(-COMMUNITY_MAX_TOP_LEVEL_COMMENTS).map(trimCommunityThreadNode),
  };
}

export function normalizePhoneCommunityState(phone: PhoneState): PhoneState {
  phone.communityConfig = {
    forumEnabled: Boolean(phone.communityConfig?.forumEnabled),
    tiebaEnabled: Boolean(phone.communityConfig?.tiebaEnabled),
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

  if (current) {
    summary[current] = Math.max(0, summary[current] - 1);
  }
  if (next) {
    summary[next] = Math.max(0, summary[next] + 1);
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
