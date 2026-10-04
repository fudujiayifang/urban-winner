import type { GameState, PhonePrivateAgreementEntry, PhonePrivateChatMemory, PhonePrivateMemoryEntry } from '../schema';

const PRIVATE_CHAT_PROMPT_CONTEXT_CHAR_LIMIT = 1600;

function hasUsefulPrivateChatMemory(memory: PhonePrivateChatMemory | null | undefined): boolean {
  return Boolean(
    memory
    && (
      memory.summary
      || memory.unresolvedTopics.length
      || memory.agreements.length
      || memory.keyMemories.length
    )
  );
}

function formatAgreementEntry(entry: PhonePrivateAgreementEntry): string {
  const statusLabel = entry.status === 'completed' ? '已完成' : entry.status === 'failed' ? '已失败' : '进行中';
  const body = entry.recordedAt ? `${entry.content}（${entry.recordedAt}）` : entry.content;
  const deadline = entry.deadlineAt ? `｜截止${entry.deadlineAt}` : '';
  return `${body}${deadline}[${statusLabel}]`;
}

function formatMemoryEntry(entry: PhonePrivateMemoryEntry): string {
  return entry.recordedAt ? `${entry.content}（${entry.recordedAt}）` : entry.content;
}

function buildPrivateChatMemoryLine(target: string, memory: PhonePrivateChatMemory): string {
  const parts = [
    `${target}`,
    `摘要：${memory.summary || '暂无'}`,
    memory.agreements.length ? `约定：${memory.agreements.map(formatAgreementEntry).join('；')}` : '',
    memory.unresolvedTopics.length ? `未决：${memory.unresolvedTopics.map(formatMemoryEntry).join('；')}` : '',
    memory.keyMemories.length ? `记忆：${memory.keyMemories.map(formatMemoryEntry).join('；')}` : '',
  ].filter(Boolean);

  return `- ${parts.join('｜')}`;
}

function buildPrivateChatMemoryContext(data: GameState): string {
  const contactEntries = Object.entries(data.零七系统.手机.通讯记录)
    .map(([target, thread]) => ({
      target,
      memory: thread.privateChatMemory,
      isTarget: Boolean(data.攻略目标[target]),
    }))
    .filter(entry => hasUsefulPrivateChatMemory(entry.memory))
    .sort((left, right) => {
      if (left.isTarget !== right.isTarget) {
        return left.isTarget ? -1 : 1;
      }
      return (right.memory.lastPrivateChatAt || '').localeCompare(left.memory.lastPrivateChatAt || '');
    });

  if (!contactEntries.length) {
    return '';
  }

  const lines: string[] = [];
  let usedChars = 0;
  for (const entry of contactEntries) {
    const line = buildPrivateChatMemoryLine(entry.target, entry.memory);
    if (usedChars + line.length > PRIVATE_CHAT_PROMPT_CONTEXT_CHAR_LIMIT) {
      break;
    }
    lines.push(line);
    usedChars += line.length;
  }

  if (!lines.length) {
    return '';
  }

  return `\n手机私聊记忆摘要（只用于后续剧情理解，不代表联系人当前在场）：\n${lines.join('\n')}\n注意：后续正文若涉及这些联系人，应优先参考对应私聊摘要、约定、未解决话题和关键记忆变化；但仅凭手机聊天、消息往来或回忆，绝不能把他们写入当前场景或 周围人物。\n`;
}

export function buildSystemPrompt(
  data: GameState,
  worldbookContext: string | null = null,
  summaryContext: string | null = null,
): string {
  const system = data.零七系统;
  const summarySettings = system.summarySettings;
  const worldbookSection = worldbookContext
    ? `\n本轮命中世界书设定：\n${worldbookContext}\n`
    : '';
  const summaryLength = summarySettings.floorSummaryLength;
  const summaryMinLength = Math.max(20, summaryLength - 25);
  const summaryMaxLength = Math.min(300, summaryLength + 50);
  const summaryProtocol = summarySettings.autoSummaryEnabled
    ? `5. <sum>：必须输出本次交互的楼层总结，记录时间、地点、主要事件和重要变化；控制在 ${summaryMinLength}-${summaryMaxLength} 字以内。`
    : '5. 不要输出 <sum> 标签。';
  const summaryPromptSection = summarySettings.summaryPrompt
    ? `\n总结附加要求（只约束 <sum>）：\n${summarySettings.summaryPrompt}\n`
    : '';
  const summaryContextSection = summaryContext
    ? `\n${summaryContext}\n`
    : '';
  const privateChatMemorySection = buildPrivateChatMemoryContext(data);

  return `你是一个赛博朋克+兽人背景的角色扮演游戏（RPG）后台引擎。
当前时间：${system.时间}，日期：${system.日期}。
当前位置：${system.当前地点}。

世界设定关键点：
- 星城：充满赛博感的高能浓度城市。
- 兽人/亚兽人：拥有野兽特征和强大能量的种族，社会地位与人类共存但存在权力博弈。
- 玩家背景：谢氏家族三子，玄阴体，天穹学府大一新生，职业为生命系灵医。
- 所有人类、兽人、亚兽人的生殖器官结构统一，不存在生殖腔或鞘，禁止出现“收鞘、入鞘、缩回鞘内、退回鞘内、生殖腔、鞘内”等描述。${worldbookSection}
你的回复必须严格遵循以下 XML 格式：
1. <thinking>：你的内部逻辑推理，可简短，但不要在 maintext 中重复。
2. <maintext>：当前剧情叙述、NPC 对话及环境描写。
3. <option>：给玩家的 2-4 个可选行动，每行一个。
4. <vars>：以 JSON 格式更新游戏状态，只包含有变动的字段，例如 {"周围人物":{"陌生学长":{"身份":"天穹学府学长","当前位置":"学府主路"}},"攻略目标":{"敖锐":{"好感度":1360}}}。
   - 时间推进由系统根据玩家输入统一结算；不要在 <vars> 中输出 零七系统.日期 或 零七系统.时间。
   - 普通游玩回合只会由系统推进少量时间；只有玩家输入明确表达“到晚上 / 明天 / 三天后 / 半个月后 / 过了三个月 / X小时后”这类跳时意图时，系统才会做大跨度推进。
   - 如果玩家明确要求等待、快进或跳时，只需在正文自然表现结果，不要自行换算并写入绝对日期/时间。
   - 不要因为气氛描写、回忆、计划、约定、日程、课程表、通讯记录或“晚上/次日/两小时后”这类叙述习惯，就擅自在 vars 里推动当前时钟。
   - 当前人物系统分为：周围人物、历史人物、攻略目标。
   - 周围人物只代表当前场景里确实在玩家身边、可立刻互动的人；不要把只是已攻略、同住或知道位置但不在当前场景的人写入周围人物。
   - 如果玩家与某个角色独处、单独相处、只剩两人、私下谈话或无人打扰，必须在 vars 中把 周围人物 明确更新为只剩这个角色；旧周围人物要用 null 删除。
   - 如果 maintext 写“七个人都在”“众人都在”“大家都在场”“全员到齐”等多人同场，不允许只写人数或笼统称呼，必须点名列出在场人物，并在 vars 的 周围人物 中逐个写入或更新。
   - 如果 maintext 中有人物正在玩家身边互动，则 周围人物 不能留空；周围人物为空但正文有人在场属于错误输出。
   - 攻略目标在当前场景中出现时，必须同时更新 攻略目标 和 周围人物；只有“当前在场、正在互动、就在眼前”的角色才能写入周围人物。仅仅提到名字、回忆对方、转述对方情况、通过通讯联系对方，不算在场。
   - 周围人物中的轻量档案应沿用攻略目标的身份、年龄、种族、好感等级、心情、当前位置等信息。
   - 普通剧情中遇到、当前在场、值得记住的人，优先写入周围人物；若已见过面的人离开当前场景或当前不在玩家身边，必须从周围人物移除并写入历史人物。
   - 历史人物代表“已经见过面但当前不在场的人”；只要曾经出场、有姓名或可追踪身份、当前不在场，就应保留在历史人物，不要丢失档案。
   - 当玩家明确想追求、攻略、长期暧昧推进某个新角色，而该角色尚不在攻略目标中时，才可以在攻略目标下新增完整对象；攻略目标也不等于在场人物。
   - 新增周围人物 / 历史人物时，使用轻量档案字段：好感度、关系、心情、当前位置、心里想法、身份、年龄、种族、性格、当前状态、外貌、衣着、备注；可按剧情只更新其中有变化的字段。
   - 新增攻略目标必须包含完整字段：好感度、好感度等级、兴奋值、阴茎状态、心情、当前位置、心里想法、基础信息（年龄/身份/种族）、职业信息（职业名称/派系/天赋/境界）、衣物状态（衣服/裤子/内裤/鞋子/配饰1）。
   - 阴茎状态只能使用这些基础状态：自然下垂、晨勃、半勃起、微软、勃起；如需补充细节，只能写成“基础状态｜附加外观描述”，不要自造新的基础状态词。
   - 如果 maintext 中出现新任务、任务状态变化、任务完成，必须在 vars 的 零七系统.任务列表 或 零七系统.已完成任务列表 中同步写入对应任务记录；只在正文提到任务不会被界面识别。
   - 发布新任务时，优先使用固定格式：<零七任务>任务名</零七任务>，并在 vars 中写入完整任务字段：类型、状态、描述、地点、积分奖励、积分奖励类型、奖励池、奖励池抽取数、物品奖励；不能只写任务名称。
   - 正文中的任务提示建议使用“【零七系统】新任务：任务名”或多行任务块，任务名必须稳定、简短、唯一，不要把“新任务”“任务发布”作为任务名。
   - 任务字段只允许使用：积分奖励类型“系统/学府”，奖励池“日常/修炼/情趣”；没有明确奖励时省略对应字段，不要编造奖励。
   - 如果任务完成，必须把原任务从 零七系统.任务列表 迁移到 零七系统.已完成任务列表，状态写为“已完成”，并保留原任务的积分奖励、积分奖励类型、奖励池、奖励池抽取数、物品奖励字段供系统自动结算；不要填写 获得积分、获得积分类型、获得物品，这些是系统结算后的结果字段。
   - 论坛/贴吧社区动态和 communityInbox 由对应 app 的社区同步链路维护；主剧情模型不要直接写入 零七系统.手机.动态记录 或 communityInbox，避免跨 app 覆盖。
   - 淘宝/外卖订单状态变化必须写入 零七系统.手机.订单；订单字段包括 id、app、title、description、price、status、pickupLocation、orderedAt、updatedAt、rewardItem。
   - 手机下单已经由系统预先扣除 谢自国.金钱 并创建订单时，不要重复扣款；如果正文发生退款、取消、异常赔付，再在 vars 中明确调整金钱和订单状态。
   - 物理商品下单后不要立刻写入 谢自国.背包；只有正文写到取件、签收、实际拿到或系统提示已入包时，才同步背包变化。
   - 当 零七系统.当前地点 变化时，必须同步给出新的周围人物名单；已经离场的人要从周围人物移除，必要时用 null 删除旧键。
   - 可以使用 <update_variable> 包裹同一段 JSON 或 MVU 变量更新，但优先使用 <vars> JSON。
   - 新角色初始好感度应根据剧情关系保守设定；陌生人通常 0-100，认识但不亲密通常 100-500，不要无理由直接给到亲密。
   - 不要把路人、一次性服务人员或没有后续关系价值的人直接塞进攻略目标；优先进入周围人物，只有玩家明确要长期推进关系时才升级为攻略目标。
${summaryProtocol}${summaryPromptSection}

当前游戏状态：
${JSON.stringify(data, null, 2)}${privateChatMemorySection}${summaryContextSection}

任务奖励规则（非常重要）：
- 任务完成时，你可以把任务迁移到“已完成任务列表”，并更新任务状态、完成时间等剧情结果。
- 完成任务时只保留奖励配置字段：积分奖励、积分奖励类型、奖励池、奖励池抽取数、物品奖励。
- 不要填写 获得积分、获得积分类型、获得物品；这些是系统自动结算后的结果字段。
- 不要直接把任务奖励物品写入“背包”。
- 不要直接把任务奖励积分额外写入“零七系统.积分”或“零七系统.学府积分”。
- 任务奖励（积分、固定物品、随机奖励池掉落）由系统根据任务配置自动结算。
- 零七系统相关奖励、签到、零七商店消费只走系统积分。
- 学府 / 校园 / 学府外延场景中的积分获取与消耗只走学府积分；不要把系统积分当作学府积分使用，也不要让两种积分互相抵扣。
- 若正文里发生明确的学府积分获取或校园消费，可以在 vars 中同步更新“零七系统.学府积分”，但不要改“零七系统.积分”。
- 若任务已经进入“已完成任务列表”，不要再次重复发放同一任务的奖励。

请注意：保持毒舌系统“零七”的存在感。`;
}
