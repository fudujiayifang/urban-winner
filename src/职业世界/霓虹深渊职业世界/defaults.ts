import type { GameState, RewardPoolCollection, ShopCategory, ShopItem, ShopItemState } from './schema';

export const DEFAULT_REWARD_POOLS: RewardPoolCollection = {
  日常: [
    { 名称: '营养棒', 数量: 1, 描述: '便携式高热量补给，适合赶路时快速恢复体力。', 图标: 'potion', 品质: 'N' },
    { 名称: '学府餐券', 数量: 1, 描述: '天穹学府内部餐厅通用餐券，可兑换一顿标准餐。', 图标: 'scroll', 品质: 'R' },
    { 名称: '零七日用包', 数量: 1, 描述: '零七系统打包的基础日用物资，里面总能摸到点有用的小东西。', 图标: 'gift', 品质: 'R' },
  ],
  修炼: [
    { 名称: '聚能药剂', 数量: 1, 描述: '针对聚能阶段调制的补剂，能短暂提升能量运转效率。', 图标: 'potion', 品质: 'R' },
    { 名称: '导能晶片', 数量: 1, 描述: '可嵌入训练设备的导能晶片，帮助稳定修炼节奏。', 图标: 'chip', 品质: 'SR' },
    { 名称: '静心符片', 数量: 1, 描述: '刻录了安神回路的符片，适合高强度修炼后平复精神。', 图标: 'book', 品质: 'R' },
  ],
  情趣: [
    { 名称: '香氛试管', 数量: 1, 描述: '带着淡淡兽息香调的试管香氛，适合暧昧场合试探反应。', 图标: 'potion', 品质: 'R' },
    { 名称: '丝缎眼罩', 数量: 1, 描述: '触感柔软的高档眼罩，零七对它的用途评价相当微妙。', 图标: 'gift', 品质: 'SR' },
    { 名称: '贴身束带', 数量: 1, 描述: '看起来像普通配饰，但材质和设计都明显不是为了普通场合。', 图标: 'key', 品质: 'SR' },
  ],
};

export const DEFAULT_SHOP_REFRESH_PRICE = 20;
export const DEFAULT_SHOP_SLOT_COUNT_PER_CATEGORY = 20;
export const DEFAULT_SHOP_CATEGORY_ORDER: ShopCategory[] = ['日常', '修炼', '情趣'];

export const DEFAULT_SHOP_MASTER_POOL: ShopItem[] = [
  { id: 'repair-spray', name: '修复喷雾', category: '日常', price: 28, rarity: 'N', icon: 'potion', description: '基础万用喷雾，适合日常损耗后的快速处理。' },
  { id: 'energy-bar', name: '能量棒', category: '日常', price: 18, rarity: 'N', icon: 'chip', description: '高热量便携补给，适合赶路与课间快速恢复。' },
  { id: 'meal-voucher', name: '高热套餐券', category: '日常', price: 34, rarity: 'R', icon: 'scroll', description: '学府食堂的特别套餐券，吃完一整天都不容易饿。' },
  { id: 'sleep-patch', name: '安眠贴片', category: '日常', price: 42, rarity: 'R', icon: 'book', description: '贴上后能快速放松神经，适合高压日程后的短时休整。' },
  { id: 'campus-pass', name: '短途通行券', category: '日常', price: 30, rarity: 'N', icon: 'key', description: '学府内短途交通的临时通行券，赶课时很有用。' },
  { id: 'clean-kit', name: '自清洁套组', category: '日常', price: 46, rarity: 'R', icon: 'gift', description: '纳米清洁布和便携除味片的组合，适合整理宿舍与装备。' },
  { id: 'first-aid-gel', name: '急救凝胶', category: '日常', price: 58, rarity: 'R', icon: 'potion', description: '能快速封闭轻微伤口的医用凝胶，训练后常备。' },
  { id: 'weather-film', name: '恒温薄膜', category: '日常', price: 66, rarity: 'SR', icon: 'scroll', description: '贴在外套内侧即可稳定体感温度，星城热浪里尤其舒服。' },
  { id: 'note-cache', name: '课程速记包', category: '日常', price: 40, rarity: 'R', icon: 'book', description: '自动整理课堂重点的学习包，适合补漏。' },
  { id: 'snack-box', name: '宿舍零食盒', category: '日常', price: 24, rarity: 'N', icon: 'gift', description: '装着各种高糖小零食的补给盒，很容易被室友盯上。' },
  { id: 'focus-tonic', name: '聚能药剂', category: '修炼', price: 52, rarity: 'R', icon: 'potion', description: '针对聚能阶段调制的补剂，能提升一次训练的专注效率。' },
  { id: 'guidance-chip', name: '导能晶片', category: '修炼', price: 88, rarity: 'SR', icon: 'chip', description: '可嵌入训练设备的高阶导能晶片，帮助修炼过程更加稳定。' },
  { id: 'mind-sigil', name: '静心符片', category: '修炼', price: 64, rarity: 'R', icon: 'book', description: '刻录安神回路的符片，适合高强度训练后的精神回稳。' },
  { id: 'force-gloves', name: '引导手套', category: '修炼', price: 118, rarity: 'SR', icon: 'sword', description: '针对能量传导设计的训练手套，能改善术式引导手感。' },
  { id: 'pulse-weight', name: '脉冲负重环', category: '修炼', price: 76, rarity: 'R', icon: 'key', description: '能按训练节奏释放阻尼的负重环，适合基础体能课。' },
  { id: 'breath-manual', name: '导息手册', category: '修炼', price: 48, rarity: 'N', icon: 'book', description: '零七整理的入门导息笔记，重点标得很刻薄但有效。' },
  { id: 'resonance-crystal', name: '共振晶砂', category: '修炼', price: 132, rarity: 'SR', icon: 'chip', description: '可铺进训练阵列的晶砂，能提升能量反馈清晰度。' },
  { id: 'stamina-shot', name: '耐力针剂', category: '修炼', price: 72, rarity: 'R', icon: 'potion', description: '短时间缓解训练疲劳的针剂，不建议连续使用。' },
  { id: 'stance-marker', name: '步法校准器', category: '修炼', price: 94, rarity: 'SR', icon: 'scroll', description: '投影步点与重心线，能纠正近身战步法问题。' },
  { id: 'aura-band', name: '聚能腕带', category: '修炼', price: 156, rarity: 'SSR', icon: 'sword', description: '高阶训练腕带，会记录并纠正能量流失点。' },
  { id: 'scent-vial', name: '香氛试管', category: '情趣', price: 72, rarity: 'R', icon: 'potion', description: '气味细腻的香氛试管，适合在若有若无的距离里试探氛围。' },
  { id: 'silk-blindfold', name: '丝缎眼罩', category: '情趣', price: 96, rarity: 'SR', icon: 'gift', description: '触感柔软的高档眼罩，零七对此的吐槽异常丰富。' },
  { id: 'body-harness', name: '贴身束带', category: '情趣', price: 118, rarity: 'SR', icon: 'key', description: '表面是装饰配件，设计细节却明显指向更暧昧的用途。' },
  { id: 'warm-collar', name: '感温颈环', category: '情趣', price: 168, rarity: 'SSR', icon: 'sword', description: '会根据体温变化微调贴合感的高定饰品，价格昂贵但效果直接。' },
  { id: 'soft-cuffs', name: '柔性束环', category: '情趣', price: 86, rarity: 'R', icon: 'key', description: '外观像运动护腕，锁扣结构却藏得很巧妙。' },
  { id: 'whisper-card', name: '低语卡片', category: '情趣', price: 54, rarity: 'N', icon: 'scroll', description: '写着暧昧指令的小卡片，适合让气氛突然偏离正轨。' },
  { id: 'heat-oil', name: '感温按摩油', category: '情趣', price: 104, rarity: 'SR', icon: 'potion', description: '接触体温后会缓慢升温的护理油，标签写得很含蓄。' },
  { id: 'tail-ribbon', name: '尾饰缎带', category: '情趣', price: 78, rarity: 'R', icon: 'gift', description: '为兽人尾部设计的装饰缎带，材质柔软且不易滑落。' },
  { id: 'privacy-screen', name: '私密屏障贴', category: '情趣', price: 128, rarity: 'SR', icon: 'chip', description: '临时隔绝房间内声光的小型贴片，宿舍里很受欢迎。' },
  { id: 'pulse-ring', name: '心跳指环', category: '情趣', price: 148, rarity: 'SSR', icon: 'sword', description: '会同步佩戴者心跳的指环，适合距离很近时使用。' },
];

function createShopSlotId(category: ShopCategory, index: number): string {
  return `${category}-${String(index + 1).padStart(2, '0')}`;
}

function buildDefaultRewardPools(): RewardPoolCollection {
  return {
    日常: DEFAULT_REWARD_POOLS.日常.map(item => ({ ...item })),
    修炼: DEFAULT_REWARD_POOLS.修炼.map(item => ({ ...item })),
    情趣: DEFAULT_REWARD_POOLS.情趣.map(item => ({ ...item })),
  };
}

function buildDefaultShopItems(sourcePool: ShopItem[] = DEFAULT_SHOP_MASTER_POOL): ShopItemState[] {
  return DEFAULT_SHOP_CATEGORY_ORDER.flatMap(category => {
    const source = sourcePool.filter(item => item.category === category);

    return Array.from({ length: DEFAULT_SHOP_SLOT_COUNT_PER_CATEGORY }, (_, index) => ({
      ...source[index % source.length],
      slotId: createShopSlotId(category, index),
      status: 'available' as const,
    }));
  });
}

export const DEFAULT_SHOP_ITEMS: ShopItemState[] = buildDefaultShopItems();

export const DEFAULT_GAME_STATE: GameState = {
  谢自国: {
    国籍: '华夏联邦',
    年龄: '18岁',
    身高: '170cm',
    身份: '谢氏三子 · 大一新生',
    种族: '人类 · 玄阴体',
    金钱: 50000,
    功勋: 0,
    stats: {
      力量: 38,
      敏捷: 45,
      智力: 72,
      耐力: 40,
    },
    背包: {
      录取通知: { 数量: 1, 描述: '天穹学府的入学通知书，采用量子加密。', 图标: 'scroll', 品质: 'R' },
      个人终端: { 数量: 1, 描述: '谢氏家族标配的最新款终端。', 图标: 'chip', 品质: 'SR' },
      修复剂: { 数量: 2, 描述: '基础的万用修复喷雾。', 图标: 'potion', 品质: 'N' },
      G栋门禁: { 数量: 1, 描述: '别墅区 G 栋的最高权限卡。', 图标: 'key', 品质: 'SR' },
      谢氏徽章: { 数量: 1, 描述: '谢氏家族三子的身份证明。', 图标: 'sword', 品质: 'SSR' },
      入学手册: { 数量: 1, 描述: '厚厚的一本电子书，记载了天穹学府校规。', 图标: 'book', 品质: 'N' },
    },
  },
  零七系统: {
    积分: 500,
    学府积分: 0,
    日期: '2778.08.30',
    时间: '15:45',
    当前地点: 'G栋·门口',
    当前天气: '晴朗',
    温度: '32°C',
    签到: {
      今日已签到: false,
      连续天数: 0,
      历史记录: [],
      奖励记录: [],
    },
    商店: {
      当前商品: DEFAULT_SHOP_ITEMS,
      刷新价格: DEFAULT_SHOP_REFRESH_PRICE,
      刷新次数: 0,
      上次刷新时间: '2778.08.31 15:45',
      已见商品: [],
      已售商品: [],
      补货轮次: 0,
      分类补货轮次: {
        日常: 0,
        修炼: 0,
        情趣: 0,
      },
    },
    商品池: {
      商店主池: DEFAULT_SHOP_MASTER_POOL.map(item => ({ ...item })),
      奖励池: buildDefaultRewardPools(),
    },
    手机: {
      联系人: [],
      通讯记录: {},
      NPC档案: {},
      订单: {},
      communityConfig: {
        forumEnabled: false,
        tiebaEnabled: false,
        communityMigrationVersion: 0,
      },
      communityInbox: [],
      动态记录: [],
    },
    summarySettings: {
      floorSummaryLength: 75,
      floorSummarySendLimit: 400,
      autoSummaryEnabled: true,
      summaryPrompt: '',
    },
    课程表: {
      记录: [],
    },
    任务列表: {
      新生报到: {
        类型: '历程',
        状态: '进行中',
        描述: '前往行政楼完成入学注册',
        地点: '天穹学府 · 行政楼',
        积分奖励: 50,
        积分奖励类型: '学府',
        物品奖励: [
          { 名称: '学府身份卡', 数量: 1, 描述: '完成报到后核发的正式身份卡，可通行大部分校区。', 图标: 'key', 品质: 'SR' },
        ],
        奖励池: '日常',
        奖励池抽取数: 1,
      },
      天穹学府探索: {
        类型: '探索',
        状态: '新',
        描述: '熟悉学府各区域',
        地点: '天穹学府全域',
        积分奖励: 30,
        积分奖励类型: '学府',
        奖励池: '修炼',
        奖励池抽取数: 1,
      },
      七人团的邀约: {
        类型: '攻略',
        状态: '待定',
        描述: '是否接受他们的合住邀请？',
        地点: '别墅区G栋',
        积分奖励: 100,
        积分奖励类型: '系统',
        奖励池: '情趣',
        奖励池抽取数: 1,
      },
    },
    已完成任务列表: {},
  },
  周围人物: {},
  历史人物: {},
  攻略目标: {
    敖锐: {
      好感度: 1350,
      好感度等级: '亲密',
      兴奋值: 15,
      阴茎状态: '自然下垂',
      心情: '平静',
      当前位置: 'G栋·一层客厅',
      心里想法: '自国到了，房间已经收拾好了',
      基础信息: { 年龄: '19岁', 身份: '敖氏次子·学府学生会副会长', 种族: '龙科兽人' },
      职业信息: { 职业名称: '龙将', 派系: '强袭+统帅', 天赋: 'SSS', 境界: '聚能·上位' },
      衣物状态: { 衣服: '黑色圆领短袖T恤', 裤子: '黑色直筒长裤', 内裤: '黑色平角内裤', 鞋子: '黑色皮质休闲鞋', 配饰1: '黑色金属手表' },
    },
    石磊: {
      好感度: 1400,
      好感度等级: '亲密',
      兴奋值: 10,
      阴茎状态: '自然下垂',
      心情: '温和',
      当前位置: 'G栋·门口',
      心里想法: '这小子就带这么点行李，回头看缺什么再补',
      基础信息: { 年龄: '19岁', 身份: '石氏次子·天穹学府大二', 种族: '猫科兽人' },
      职业信息: { 职业名称: '狮铠', 派系: '强袭+守护', 天赋: 'SSS', 境界: '聚能·上位' },
      衣物状态: { 衣服: '白色圆领短袖T恤', 裤子: '黑色直筒长裤', 内裤: '黑色平角内裤', 鞋子: '黑色休闲皮鞋', 配饰1: '黑色金属手表' },
    },
    苍岚: {
      好感度: 1300,
      好感度等级: '亲密',
      兴奋值: 20,
      阴茎状态: '自然下垂',
      心情: '开心',
      当前位置: 'G栋·一层客厅',
      心里想法: '自国终于搬过来了，以后天天能见着',
      基础信息: { 年龄: '19岁', 身份: '苍氏三子·天穹学府大二', 种族: '犬科兽人' },
      职业信息: { 职业名称: '影狼', 派系: '强袭+幽影', 天赋: 'SSS', 境界: '聚能·上位' },
      衣物状态: { 衣服: '白色圆领短袖T恤', 裤子: '黑色运动长裤', 内裤: '天蓝色平角内裤', 鞋子: '白色运动鞋', 配饰1: '黑色运动手表' },
    },
    雷啸: {
      好感度: 1250,
      好感度等级: '亲密',
      兴奋值: 35,
      阴茎状态: '半勃起',
      心情: '随意',
      当前位置: 'G栋·一层客厅',
      心里想法: '自国来了正好，等会儿拉他看我训练',
      基础信息: { 年龄: '19岁', 身份: '雷氏次子·天穹学府大二', 种族: '猫科兽人' },
      职业信息: { 职业名称: '雷虎', 派系: '强袭+能量', 天赋: 'SSS', 境界: '聚能·上位' },
      衣物状态: { 衣服: '黑色运动背心', 裤子: '黑色运动短裤', 内裤: '黑色平角内裤', 鞋子: '没穿', 配饰1: '黑色运动手环' },
    },
    敖昂: {
      好感度: 1200,
      好感度等级: '亲密',
      兴奋值: 10,
      阴茎状态: '自然下垂',
      心情: '平常',
      当前位置: 'G栋·一层客厅',
      心里想法: '自国总算来了，以后住一起方便',
      基础信息: { 年龄: '19岁', 身份: '敖氏三子·天穹学府大二', 种族: '龙科兽人' },
      职业信息: { 职业名称: '影龙', 派系: '强袭+幽影', 天赋: 'SSS', 境界: '聚能·上位' },
      衣物状态: { 衣服: '深灰色连帽卫衣', 裤子: '黑色工装裤', 内裤: '黑色平角内裤', 鞋子: '黑色高帮运动鞋', 配饰1: '左耳银色耳钉' },
    },
    白祈: {
      好感度: 1200,
      好感度等级: '亲密',
      兴奋值: 5,
      阴茎状态: '自然下垂',
      心情: '困',
      当前位置: 'G栋·客厅沙发',
      心里想法: '自国来了就好，困，等他进来再说',
      基础信息: { 年龄: '19岁', 身份: '白氏三子·天穹学府大二', 种族: '猫科兽人' },
      职业信息: { 职业名称: '魇豹', 派系: '强袭+诡异', 天赋: 'SSS', 境界: '聚能·上位' },
      衣物状态: { 衣服: '浅灰色连帽卫衣', 裤子: '黑色束脚运动裤', 内裤: '黑色平角内裤', 鞋子: '没穿', 配饰1: '无' },
    },
    闻骁: {
      好感度: 1150,
      好感度等级: '亲密',
      兴奋值: 12,
      阴茎状态: '自然下垂',
      心情: '普通',
      当前位置: 'G栋·一层客厅',
      心里想法: '手里零件还差两个就装完了，等会儿再打招呼',
      基础信息: { 年龄: '19岁', 身份: '闻氏四子·天穹学府大二', 种族: '犬科兽人' },
      职业信息: { 职业名称: '战械师', 派系: '强袭+技术', 天赋: 'SSS', 境界: '聚能·上位' },
      衣物状态: { 衣服: '黑色圆领短袖T恤', 裤子: '黑色工装裤', 内裤: '深灰色平角内裤', 鞋子: '黑色工装靴', 配饰1: '黑色电子手表' },
    },
  },
  社交头像: {},
};
