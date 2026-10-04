import _ from 'lodash';

import type { GenerateResult } from '../adapters/runtime';
import type { CommunityInboxItem, CommunityReply, GameState, PhoneFeedPost } from '../schema';
import {
  COMMUNITY_MAX_DEPTH,
  COMMUNITY_MAX_INBOX,
  COMMUNITY_MAX_POSTS,
  COMMUNITY_MAX_REPLIES_PER_NODE,
  COMMUNITY_MAX_TOP_LEVEL_COMMENTS,
  COMMUNITY_PLAYER_AUTHOR,
  getCommunityHandle,
  normalizeCommunityInboxItem,
  normalizeCommunityPost,
  trimCommunityPost,
} from './community-state';
import { extractJsonObjectText, parseVars } from './response-parser';

export type CommunitySyncPatch = {
  零七系统?: {
    手机?: Partial<GameState['零七系统']['手机']>;
  };
};

export type CommunityBootstrapResult = {
  app: 'forum' | 'tieba';
  patch: CommunitySyncPatch | null;
};

const MAX_MAINTEXT_CHARS = 2600;
const MAX_USER_INPUT_CHARS = 600;
const MAX_BOOTSTRAP_POSTS = 5;
const MAX_INCREMENTAL_POSTS_PER_TURN = 2;
const MAX_INCREMENTAL_INBOX_PER_TURN = 12;
const MAX_TEXT_LENGTH = 160;

const COMMUNITY_BOOTSTRAP_JSON_SCHEMA = {
  name: 'community_bootstrap_patch',
  description: '用于初始化论坛或贴吧社区状态的 JSON 补丁',
  value: {
    type: 'object',
    additionalProperties: false,
    properties: {
      零七系统: {
        type: 'object',
        additionalProperties: false,
        properties: {
          手机: {
            type: 'object',
            additionalProperties: false,
            properties: {
              动态记录: { type: 'array' },
              communityInbox: { type: 'array' },
            },
          },
        },
      },
    },
  },
} as const;

const COMMUNITY_INCREMENTAL_JSON_SCHEMA = COMMUNITY_BOOTSTRAP_JSON_SCHEMA;

function truncate(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function sanitizeText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const text = truncate(value, maxLength);
  return text.length > 0 ? text : undefined;
}

function sanitizeReactionSummary(value: unknown): { like: number; dislike: number } {
  const record = _.isPlainObject(value) ? (value as Record<string, unknown>) : {};
  return {
    like: Math.max(0, Math.trunc(Number(record.like ?? 0) || 0)),
    dislike: Math.max(0, Math.trunc(Number(record.dislike ?? 0) || 0)),
  };
}

function sanitizeNode(value: unknown, fallbackAt = '', currentDepth = 1): CommunityReply | null {
  if (!_.isPlainObject(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const body = sanitizeText(record.body ?? record.content ?? record.text, currentDepth >= COMMUNITY_MAX_DEPTH ? 120 : MAX_TEXT_LENGTH);
  if (!body) {
    return null;
  }

  const depth = Math.max(1, Math.min(COMMUNITY_MAX_DEPTH, Math.trunc(Number(record.depth ?? currentDepth) || currentDepth)));
  const id = sanitizeText(record.id, 64) ?? _.uniqueId(`node-${depth}-`);
  const rawReplies = Array.isArray(record.replies)
    ? record.replies
    : Array.isArray(record.children)
      ? record.children
      : Array.isArray(record.回复)
        ? record.回复
        : [];
  const replies = depth >= COMMUNITY_MAX_DEPTH
    ? []
    : rawReplies
      .map(reply => sanitizeNode(reply, fallbackAt, depth + 1))
      .filter((reply): reply is CommunityReply => Boolean(reply))
      .slice(-COMMUNITY_MAX_REPLIES_PER_NODE);

  return {
    id,
    author: getCommunityHandle(id),
    body,
    at: sanitizeText(record.at ?? record.time ?? record.createdAt, 32) ?? fallbackAt,
    depth,
    reactions: sanitizeReactionSummary(record.reactions ?? record.likes),
    playerReaction: null,
    replies,
  };
}

function sanitizePost(value: unknown, app: 'forum' | 'tieba'): PhoneFeedPost | null {
  if (!_.isPlainObject(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const body = sanitizeText(record.body ?? record.content ?? record.text, 220);
  if (!body) {
    return null;
  }

  const title = sanitizeText(record.title ?? record.subject ?? record.topic, 64) ?? body.slice(0, 24);
  const id = sanitizeText(record.id, 64) ?? _.uniqueId(`post-${app}-`);
  const at = sanitizeText(record.at ?? record.time ?? record.createdAt, 32) ?? '';
  const rawComments = Array.isArray(record.comments)
    ? record.comments
    : Array.isArray(record.replies)
      ? record.replies
      : Array.isArray(record.评论)
        ? record.评论
        : [];
  const comments = rawComments
    .map(comment => sanitizeNode(comment, at, 1))
    .filter((comment): comment is CommunityReply => Boolean(comment))
    .slice(-COMMUNITY_MAX_TOP_LEVEL_COMMENTS);

  return {
    id,
    app,
    author: getCommunityHandle(id),
    title,
    body,
    at,
    category: sanitizeText(record.category ?? record.tag ?? record.type, 24) ?? (app === 'forum' ? '广场' : '首页'),
    lastActivityAt: sanitizeText(record.lastActivityAt ?? record.updatedAt ?? record.at ?? record.time, 32) ?? at,
    reactions: sanitizeReactionSummary(record.reactions ?? record.likes),
    playerReaction: null,
    comments,
  };
}

function sanitizeInboxItem(value: unknown, app: 'forum' | 'tieba'): CommunityInboxItem | null {
  if (!_.isPlainObject(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return normalizeCommunityInboxItem({ ...record, app }, typeof record.at === 'string' ? record.at : '');
}

function mergePosts(existing: PhoneFeedPost[], incoming: PhoneFeedPost[], maxNewPosts: number): PhoneFeedPost[] {
  const postMap = new Map(existing.map(post => [post.id, _.cloneDeep(post)]));
  let appended = 0;

  for (const post of incoming) {
    if (!postMap.has(post.id)) {
      if (appended >= maxNewPosts) {
        continue;
      }
      appended += 1;
    }
    postMap.set(post.id, trimCommunityPost(post));
  }

  return Array.from(postMap.values())
    .map(post => normalizeCommunityPost(post) ?? post)
    .sort((left, right) => left.lastActivityAt.localeCompare(right.lastActivityAt))
    .slice(-COMMUNITY_MAX_POSTS);
}

function resolveCommunityPhonePatch(rawPatch: unknown): Record<string, unknown> | null {
  if (!_.isPlainObject(rawPatch)) {
    return null;
  }

  const root = rawPatch as Record<string, unknown>;
  const candidates = [
    _.get(root, '零七系统.手机'),
    root.手机,
    root,
  ];

  for (const candidate of candidates) {
    if (!_.isPlainObject(candidate)) {
      continue;
    }
    const record = candidate as Record<string, unknown>;
    if (
      Array.isArray(record.动态记录)
      || Array.isArray(record.communityInbox)
      || Array.isArray(record.posts)
      || Array.isArray(record.inbox)
      || Array.isArray(record.帖子)
      || Array.isArray(record.消息)
    ) {
      return record;
    }
  }

  return null;
}

function sanitizeCommunityPatch(rawPatch: unknown, state: GameState, options: { app: 'forum' | 'tieba'; maxNewPosts: number }): CommunitySyncPatch | null {
  const phonePatch = resolveCommunityPhonePatch(rawPatch);
  if (!phonePatch) {
    return null;
  }

  const rawPosts = Array.isArray(phonePatch.动态记录)
    ? phonePatch.动态记录
    : Array.isArray(phonePatch.posts)
      ? phonePatch.posts
      : Array.isArray(phonePatch.帖子)
        ? phonePatch.帖子
        : [];
  const hasPostField = Array.isArray(phonePatch.动态记录) || Array.isArray(phonePatch.posts) || Array.isArray(phonePatch.帖子);
  const incomingPosts = rawPosts
    .map(post => sanitizePost(post, options.app))
    .filter((post): post is PhoneFeedPost => Boolean(post));

  const rawInbox = Array.isArray(phonePatch.communityInbox)
    ? phonePatch.communityInbox
    : Array.isArray(phonePatch.inbox)
      ? phonePatch.inbox
      : Array.isArray(phonePatch.消息)
        ? phonePatch.消息
        : [];
  const inboxItems = rawInbox
    .map(item => sanitizeInboxItem(item, options.app))
    .filter((item): item is CommunityInboxItem => item !== null && item.app === options.app)
    .slice(0, MAX_INCREMENTAL_INBOX_PER_TURN);

  const filteredInbox = inboxItems.filter(item => item.actor !== COMMUNITY_PLAYER_AUTHOR);
  const nextPatch: CommunitySyncPatch = {
    零七系统: {
      手机: {},
    },
  };

  if (hasPostField && incomingPosts.length > 0) {
    const currentPosts = state.零七系统.手机.动态记录.filter(post => post.app === options.app);
    const nextPosts = mergePosts(currentPosts, incomingPosts, options.maxNewPosts);
    const otherPosts = state.零七系统.手机.动态记录.filter(post => post.app !== options.app);
    nextPatch.零七系统!.手机!.动态记录 = [...otherPosts, ...nextPosts].slice(-COMMUNITY_MAX_POSTS);
  }

  if (filteredInbox.length > 0) {
    nextPatch.零七系统!.手机!.communityInbox = [
      ...state.零七系统.手机.communityInbox.filter(item => item.app !== options.app || item.actor !== COMMUNITY_PLAYER_AUTHOR),
      ...filteredInbox,
    ].slice(-COMMUNITY_MAX_INBOX);
  }

  return Object.keys(nextPatch.零七系统!.手机!).length > 0 ? nextPatch : null;
}

function parseCommunitySyncResponse(rawText: string): unknown {
  if (!rawText.trim()) {
    throw new Error('社区 AI 返回了空内容；请求已完成，但没有可写入的帖子。');
  }

  try {
    return parseVars(rawText);
  } catch {
    const jsonText = extractJsonObjectText(rawText);
    if (!jsonText) {
      throw new Error('社区 AI 回包不是 JSON，帖子没有写入。');
    }
    try {
      return parseVars(jsonText);
    } catch {
      throw new Error('社区 AI 回包中的 JSON 格式无效，帖子没有写入。');
    }
  }
}

function summarizeNode(node: CommunityReply, depthLimit = COMMUNITY_MAX_DEPTH, childLimit = 3): Record<string, unknown> {
  return {
    id: node.id,
    author: node.author,
    body: truncate(node.body, 80),
    at: node.at,
    depth: node.depth,
    reactions: node.reactions,
    replies: depthLimit <= 1 ? [] : node.replies.slice(-childLimit).map((reply: CommunityReply) => summarizeNode(reply, depthLimit - 1, childLimit)),
  };
}

function summarizePost(post: PhoneFeedPost): Record<string, unknown> {
  return {
    id: post.id,
    app: post.app,
    author: post.author,
    title: post.title,
    body: truncate(post.body, 120),
    at: post.at,
    category: post.category,
    lastActivityAt: post.lastActivityAt,
    reactions: post.reactions,
    comments: post.comments.slice(-6).map(comment => summarizeNode(comment, 3, 3)),
  };
}

function buildCommunityBootstrapPrompt(app: 'forum' | 'tieba', bootstrap: boolean): string {
  const appLabel = app === 'forum' ? '论坛' : '贴吧';
  const tone = app === 'forum'
    ? '公开的职业者专业交流平台，内容只围绕职业任务、资源、情报、求助、招募和行业交流。'
    : '开放网络社区，以稳定虚构网名交流；话题必须来自当前剧情事件，不从地点本身制造话题。';

  return [
    `你是一个只负责同步${appLabel}社区状态的 JSON 生成器。`,
    bootstrap
      ? '这是用户主动初始化社区，不要求本轮剧情提供事件线索。生成 3-5 条内容各异的虚构社区首批帖子，不要声称发生过具体剧情事件，也不要绑定当前地点。'
      : '根据本轮正文、玩家输入和现有社区状态生成最小 patch；没有明确相关事件时返回空动态记录。',
    '只允许输出顶层字段：零七系统。',
    '零七系统 下只允许输出：手机。',
    '手机 下只允许输出：动态记录、communityInbox。',
    '不要输出任何解释、Markdown、XML 或额外文本。',
    `社区气质：${tone}`,
    '帖子和评论都要像同一社区里的自然用户发言；作者字段写自然的虚构网名，不要使用现实姓名、谢自国或“匿名用户”。',
    `评论树最多 ${COMMUNITY_MAX_DEPTH} 层，不要为了凑数量补写评论。`,
    '只允许使用递归节点结构 comments/replies，不要使用平铺 commentId/replyId 列表。',
    'inbox 只记录别人对我、别人评论我、别人回复我、别人赞踩我的消息。',
    '不要把谢自国自己写进 inbox。',
    '如果是论坛，帖子必须明确写 category。category 只能使用“广场”或“委托”。',
    '“广场”用于求助、情报、资源、任务、招募和行业交流；禁止写宿舍日常、楼栋公告、地点闲聊或贴吧式八卦。',
    '“委托”用于有明确来源的正式任务、招募或职业服务需求；首批虚构内容须标明为普通社区需求，不得伪造官方委托。',
    '所有论坛内容不得提及或臆造具体楼栋、宿舍或居住地点；地点不能作为选题。',
    '如果是贴吧，首批内容可以是明确标注为虚构的校园/职业者网络话题；增量内容只围绕本轮正文中明确发生的事件或玩家明确提出的话题生成。',
  ].join('\n');
}

function buildCommunityIncrementalPrompt(app: 'forum' | 'tieba'): string {
  const appLabel = app === 'forum' ? '论坛' : '贴吧';
  return [
    `你是一个只负责同步${appLabel}社区状态的 JSON 同步器。`,
    '你的唯一任务是根据本轮玩家输入、当前正文和现有手机社区状态，输出最小 JSON patch。',
    '只允许输出顶层字段：零七系统。',
    '零七系统 下只允许输出：手机。',
    '手机 下只允许输出：动态记录、communityInbox。',
    '不要输出任何解释、Markdown、XML 或额外文本。',
    '允许更新当前 app 的既有帖子，也允许新增少量帖子；没有相关线索时可以不新增内容。',
    `评论树最多 ${COMMUNITY_MAX_DEPTH} 层。`,
    '不要把 communityInbox 写成自己的互动记录；只写别人对谢自国的互动。',
    `当前社区气质：${app === 'forum' ? '职业任务、资源、情报、求助和行业交流' : '以网名、昵称、马甲为主的开放网络社区，不默认暴露现实姓名'}`,
    `本次请求唯一目标 app：${app}。帖子与 communityInbox 只能写入当前 app，不得生成或修改另一个 app 的内容。`,
    '论坛只写职业任务、资源、情报、求助、招募和行业交流；禁止宿舍日常、楼栋公告、地点闲聊、匿名围观或贴吧式八卦。所有论坛内容不得提及或臆造 G栋、B栋、宿舍、别墅区或其他具体居住地点；正文提及地点时，也只能在职业信息确有必要时保留最少背景。',
    '贴吧只依据本轮正文中明确发生的事件、玩家明确提出的话题或明确的社区互动生成；当前地点单独出现不算话题线索。不得因为当前地点是 G栋门口、B栋或其他居住区而编造门禁、维修、邻里、围观或宿舍公告。',
    'G栋在本设定中是谢自国与敖锐等七人居住的私有别墅区，不是公共宿舍、公共街区或任何人可随意进出的地点；不得把“G栋门口”写成公共围观场所。只有正文明确描述七人之一在相应地点发生可讨论事件时，才可在贴吧内容中提及 G栋。',
    '贴吧话题与发言者应随本轮事件变化，不得重复上一条地点主题；不要为了追求随机而脱离剧情编造事实。没有具体事件时返回空 patch。',
  ].join('\n');
}

function buildCommunityUserInput(options: {
  userInput: string;
  maintext: string;
  state: GameState;
  app: 'forum' | 'tieba';
  bootstrap: boolean;
  worldbookContext?: string | null;
}): string {
  const { userInput, maintext, state, app, bootstrap, worldbookContext } = options;
  const appPosts = state.零七系统.手机.动态记录.filter(post => post.app === app).slice(-8).map(summarizePost);
  return JSON.stringify({
    模式: bootstrap ? 'bootstrap' : 'incremental',
    app,
    玩家输入: truncate(userInput, MAX_USER_INPUT_CHARS),
    本轮正文: truncate(maintext, MAX_MAINTEXT_CHARS),
    当前地点: state.零七系统.当前地点,
    当前时间: `${state.零七系统.日期} ${state.零七系统.时间}`,
    世界书设定: worldbookContext?.trim() || undefined,
    communityConfig: state.零七系统.手机.communityConfig,
    posts: appPosts,
    inbox: state.零七系统.手机.communityInbox.filter(item => item.app === app).slice(-12),
  }, null, 2);
}

export function collectCommunityStateSyncPatchFields(patch: CommunitySyncPatch): string[] {
  const fields: string[] = [];
  const phonePatch = patch.零七系统?.手机;
  if (phonePatch?.动态记录) {
    fields.push('社区动态');
  }
  if (phonePatch?.communityInbox) {
    fields.push('社区消息');
  }
  return fields;
}

export async function syncCommunityBootstrapBestEffort(options: {
  generateRaw?: (request: {
    systemPrompt: string;
    userInput: string;
    jsonSchema?: {
      name: string;
      description?: string;
      value: Record<string, unknown>;
    };
  }) => Promise<GenerateResult>;
  state: GameState;
  userInput: string;
  maintext: string;
  app: 'forum' | 'tieba';
  worldbookContext?: string | null;
}): Promise<CommunityBootstrapResult | null> {
  const { generateRaw, state, userInput, maintext, app, worldbookContext } = options;
  if (!generateRaw) {
    return null;
  }

  if (app === 'forum' && !state.零七系统.手机.communityConfig.forumEnabled) {
    return null;
  }
  if (app === 'tieba' && !state.零七系统.手机.communityConfig.tiebaEnabled) {
    return null;
  }

  const response = await generateRaw({
    systemPrompt: buildCommunityBootstrapPrompt(app, true),
    userInput: buildCommunityUserInput({ userInput, maintext, state, app, bootstrap: true, worldbookContext }),
    jsonSchema: COMMUNITY_BOOTSTRAP_JSON_SCHEMA,
  });

  const rawPatch = parseCommunitySyncResponse(response.rawText);
  const patch = sanitizeCommunityPatch(rawPatch, state, { app, maxNewPosts: MAX_BOOTSTRAP_POSTS });
  if (!patch) {
    return {
      app,
      patch: null,
    };
  }

  return {
    app,
    patch,
  };
}

export async function syncCommunityIncrementalBestEffort(options: {
  generateRaw?: (request: {
    systemPrompt: string;
    userInput: string;
    jsonSchema?: {
      name: string;
      description?: string;
      value: Record<string, unknown>;
    };
  }) => Promise<GenerateResult>;
  state: GameState;
  userInput: string;
  maintext: string;
  app: 'forum' | 'tieba';
  worldbookContext?: string | null;
}): Promise<CommunitySyncPatch | null> {
  const { generateRaw, state, userInput, maintext, app, worldbookContext } = options;
  if (!generateRaw) {
    return null;
  }

  if (app === 'forum' && !state.零七系统.手机.communityConfig.forumEnabled) {
    return null;
  }
  if (app === 'tieba' && !state.零七系统.手机.communityConfig.tiebaEnabled) {
    return null;
  }

  const response = await generateRaw({
    systemPrompt: buildCommunityIncrementalPrompt(app),
    userInput: buildCommunityUserInput({ userInput, maintext, state, app, bootstrap: false, worldbookContext }),
    jsonSchema: COMMUNITY_INCREMENTAL_JSON_SCHEMA,
  });

  const rawPatch = parseCommunitySyncResponse(response.rawText);
  return sanitizeCommunityPatch(rawPatch, state, { app, maxNewPosts: MAX_INCREMENTAL_POSTS_PER_TURN });
}
