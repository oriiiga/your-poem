/**
 * POST /api/poem-vocab
 * 根据玩家输入的「场景 + 情绪」用 LLM 生成一批主题词库（拼贴诗词语纸片）。
 * - 强相关词约 2/3，松散相关/中性词约 1/3（保留拼贴的随机与惊喜）
 * - LLM 失败或产出不足时，回退到本地关键词主题词库，保证功能永远可用
 */
import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { chatCompletionOpenAI, type ChatCompletionResult, type ChatMessage } from '@/lib/llm-client';

export const runtime = 'nodejs';
// Vercel 部署时函数最长执行时间（LLM 生成词库通常 5~15 秒）
export const maxDuration = 30;

interface ThemeWord {
  word: string;
  type: string;
}

const VALID_TYPES = new Set(['noun', 'verb', 'adj', 'time', 'emotion', 'abstract', 'location', 'state']);

/** 单字虚词/连接词黑名单：即使 LLM 返回也剔除 */
const BLACKLIST = new Set(['的', '了', '和', '与', '或', '但', '在', '是', '着', '过', '被', '把', '让', '使', '向', '于', '而', '如', '像', '若', '虽', '将', '很', '不', '没', '有', '我', '你', '他', '她', '它']);

const SYSTEM_PROMPT = `你是「拼贴诗」游戏的词汇编辑。玩家会给出一个场景与一种情绪，你为玩家挑选适合拼贴成现代诗的词语纸片。

只输出一个 JSON 对象，格式如下，不要输出任何解释、前言或 markdown 代码块：
{"words":[{"w":"词语","t":"类型"}]}

规则：
1. t 只能取：noun、verb、adj、time、emotion、abstract、location、state 之一。
2. 共输出 46 个词左右（44~52 个），互不重复，每个词 1~4 个汉字。
3. 约 32 个词与场景和情绪强相关：具体、可感、有画面（物件、动作、光线、气味、声音、心情）；其中名词性的具体意象（看得见摸得着的物件、地点、事物，如：伞、站牌、旧书、柑橘、屋顶）不得少于 22 个。
4. 名词意象中请混入约三分之一偏现代、科技、社科、历史、人文气质的名词（如：代码、信号、齿轮、胶片、天线、码头、街区、边界、碑文、青铜、卷轴、手稿、铅字、诗集、图书馆），让词语纸片有新旧交融的时代质感；自然与生活意象仍占主体。
5. 其余约 14 个词为松散相关或中性词（时间、抽象、方位、状态），保留拼贴的随机与惊喜。
6. 现代诗语感，具象优先；不要成语、不要标点、不要虚词和连接词（如：的、了、和、像、在）。`;

/** 经典意象名词：自然与旧日生活物件 */
const NOUN_BANK_CLASSIC: string[] = [
  '纸鹤', '风筝', '旧书', '信箱', '邮筒', '船票', '站台', '钟摆', '沙漏', '钥匙',
  '玻璃', '芦苇', '萤火', '野花', '麦田', '贝壳', '羽毛', '石子', '柑橘', '茶杯',
  '毛衣', '窗帘', '台灯', '木椅', '抽屉', '硬币', '汽水', '蝉鸣', '青苔', '井水',
  '晚霞', '星群', '纸箱', '手指', '肩膀', '瞳孔', '皱纹', '阴影', '巷子', '屋顶',
];

/** 现代·科技·社科·历史·人文名词：与经典意象交错混入，避免词池偏科 */
const NOUN_BANK_MODERN: string[] = [
  '代码', '电流', '天线', '频率', '快门', '胶片', '磁带', '齿轮', '引擎', '电梯',
  '塔吊', '人群', '街区', '码头', '集市', '边界', '碑文', '青铜', '陶罐', '卷轴',
  '遗址', '城墙', '印章', '诗集', '书页', '铅字', '墨迹', '手稿', '信笺', '琴键',
];

/** 交错合并：每隔一个经典词插入一个现代词，补名词时两类都能命中 */
const NOUN_BANK: string[] = (() => {
  const out: string[] = [];
  NOUN_BANK_CLASSIC.forEach((word, i) => {
    out.push(word);
    const modern = NOUN_BANK_MODERN[i];
    if (modern) out.push(modern);
  });
  return out;
})();

/** 名词数目不足 min 时从 NOUN_BANK 前置补入（前端会重新洗牌，顺序无关） */
function ensureNouns(words: ThemeWord[], min = 20): ThemeWord[] {
  const nounCount = words.filter((w) => w.type === 'noun').length;
  if (nounCount >= min) return words;
  const have = new Set(words.map((w) => w.word));
  const need = min - nounCount;
  const add: ThemeWord[] = [];
  for (const word of NOUN_BANK) {
    if (add.length >= need) break;
    if (!have.has(word)) {
      have.add(word);
      add.push({ word, type: 'noun' });
    }
  }
  return [...add, ...words];
}

/* ---------------- 本地兜底词库（接口/模型异常时保证可用） ---------------- */

const FALLBACK_THEMES: Array<{ keys: string[]; words: ThemeWord[] }> = [
  {
    keys: ['雨', '下雨', '暴雨', '雷', '阴天', '潮湿', '梅雨'],
    words: [
      { word: '雨滴', type: 'noun' }, { word: '雨声', type: 'noun' }, { word: '屋檐', type: 'noun' },
      { word: '潮湿', type: 'adj' }, { word: '伞', type: 'noun' }, { word: '积水', type: 'noun' },
      { word: '水洼', type: 'noun' }, { word: '雨幕', type: 'noun' }, { word: '淋湿', type: 'verb' },
      { word: '滴落', type: 'verb' }, { word: '灰蒙蒙', type: 'adj' }, { word: '淅沥', type: 'state' },
    ],
  },
  {
    keys: ['海', '海边', '沙滩', '浪', '潮', '岛', '礁', '灯塔'],
    words: [
      { word: '海浪', type: 'noun' }, { word: '潮汐', type: 'noun' }, { word: '贝壳', type: 'noun' },
      { word: '沙滩', type: 'noun' }, { word: '咸味', type: 'noun' }, { word: '灯塔', type: 'noun' },
      { word: '浪花', type: 'noun' }, { word: '海鸥', type: 'noun' }, { word: '搁浅', type: 'verb' },
      { word: '漂泊', type: 'verb' }, { word: '湛蓝', type: 'adj' }, { word: '辽阔', type: 'adj' },
    ],
  },
  {
    keys: ['夏', '暑', '炎热', '蝉', '西瓜', '游泳'],
    words: [
      { word: '蝉鸣', type: 'noun' }, { word: '西瓜', type: 'noun' }, { word: '树荫', type: 'noun' },
      { word: '汽水', type: 'noun' }, { word: '蒲扇', type: 'noun' }, { word: '萤火虫', type: 'noun' },
      { word: '凉鞋', type: 'noun' }, { word: '烈日', type: 'noun' }, { word: '滚烫', type: 'adj' },
      { word: '消暑', type: 'verb' },
    ],
  },
  {
    keys: ['冬', '雪', '冷', '冰', '寒', '霜', '火锅'],
    words: [
      { word: '白雪', type: 'noun' }, { word: '冰霜', type: 'noun' }, { word: '寒风', type: 'noun' },
      { word: '炉火', type: 'noun' }, { word: '围巾', type: 'noun' }, { word: '呵气', type: 'noun' },
      { word: '雾凇', type: 'noun' }, { word: '结冰', type: 'verb' }, { word: '凛冽', type: 'adj' },
      { word: '温热', type: 'adj' },
    ],
  },
  {
    keys: ['春', '樱', '花季', '发芽', '踏青'],
    words: [
      { word: '樱花', type: 'noun' }, { word: '嫩芽', type: 'noun' }, { word: '燕子', type: 'noun' },
      { word: '青草', type: 'noun' }, { word: '花期', type: 'noun' }, { word: '苏醒', type: 'verb' },
      { word: '绽放', type: 'verb' }, { word: '柔软', type: 'adj' },
    ],
  },
  {
    keys: ['秋', '枫', '落叶', '丰收', '桂花', '麦'],
    words: [
      { word: '落叶', type: 'noun' }, { word: '桂花', type: 'noun' }, { word: '枫叶', type: 'noun' },
      { word: '凉意', type: 'noun' }, { word: '麦浪', type: 'noun' }, { word: '归巢', type: 'verb' },
      { word: '泛黄', type: 'verb' }, { word: '金黄', type: 'adj' }, { word: '萧瑟', type: 'adj' },
    ],
  },
  {
    keys: ['夜', '晚', '深夜', '星', '月', '失眠', '梦'],
    words: [
      { word: '星空', type: 'noun' }, { word: '月光', type: 'noun' }, { word: '灯火', type: 'noun' },
      { word: '午夜', type: 'time' }, { word: '夜风', type: 'noun' }, { word: '失眠', type: 'verb' },
      { word: '沉睡', type: 'verb' }, { word: '安静', type: 'adj' }, { word: '幽深', type: 'adj' },
    ],
  },
  {
    keys: ['风', '吹', '拂', '台风'],
    words: [
      { word: '微风', type: 'noun' }, { word: '风铃', type: 'noun' }, { word: '衣角', type: 'noun' },
      { word: '发梢', type: 'noun' }, { word: '芦苇', type: 'noun' }, { word: '蒲公英', type: 'noun' },
      { word: '掠过', type: 'verb' }, { word: '摇曳', type: 'verb' }, { word: '轻盈', type: 'adj' },
    ],
  },
  {
    keys: ['城市', '街', '都市', '地铁', '车站', '商场', '巷', '天桥', '公交'],
    words: [
      { word: '街道', type: 'noun' }, { word: '橱窗', type: 'noun' }, { word: '车流', type: 'noun' },
      { word: '天桥', type: 'noun' }, { word: '霓虹', type: 'noun' }, { word: '巷口', type: 'noun' },
      { word: '穿行', type: 'verb' }, { word: '奔波', type: 'verb' }, { word: '拥挤', type: 'adj' },
      { word: '疏离', type: 'adj' },
    ],
  },
  {
    keys: ['科技', '数字', '网络', '手机', '电脑', '未来', '机器', '程序', '赛博'],
    words: [
      { word: '代码', type: 'noun' }, { word: '电流', type: 'noun' }, { word: '天线', type: 'noun' },
      { word: '数据', type: 'noun' }, { word: '齿轮', type: 'noun' }, { word: '快门', type: 'noun' },
      { word: '胶片', type: 'noun' }, { word: '磁带', type: 'noun' }, { word: '重启', type: 'verb' },
      { word: '加载', type: 'verb' }, { word: '冰冷', type: 'adj' }, { word: '闪光', type: 'state' },
    ],
  },
  {
    keys: ['历史', '古代', '博物馆', '文物', '古迹', '文明', '王朝', '考古'],
    words: [
      { word: '碑文', type: 'noun' }, { word: '青铜', type: 'noun' }, { word: '陶罐', type: 'noun' },
      { word: '卷轴', type: 'noun' }, { word: '遗址', type: 'noun' }, { word: '城墙', type: 'noun' },
      { word: '王朝', type: 'noun' }, { word: '编年史', type: 'noun' }, { word: '风化', type: 'verb' },
      { word: '埋葬', type: 'verb' }, { word: '古老', type: 'adj' }, { word: '斑驳', type: 'adj' },
    ],
  },
  {
    keys: ['山', '林', '溪', '河', '湖', '田', '草原', '森林', '徒步', '露营'],
    words: [
      { word: '山峦', type: 'noun' }, { word: '溪涧', type: 'noun' }, { word: '松林', type: 'noun' },
      { word: '鸟鸣', type: 'noun' }, { word: '云雾', type: 'noun' }, { word: '石阶', type: 'noun' },
      { word: '田野', type: 'noun' }, { word: '漫游', type: 'verb' }, { word: '苍翠', type: 'adj' },
      { word: '空旷', type: 'adj' },
    ],
  },
  {
    keys: ['悲', '伤', '难过', '哭', '泪', '痛', '孤独', '寂寞', '忧郁', '失落', '丧', '绝望', '崩溃', '烦', '疲惫', '委屈'],
    words: [
      { word: '眼泪', type: 'noun' }, { word: '叹息', type: 'noun' }, { word: '空荡', type: 'adj' },
      { word: '心碎', type: 'verb' }, { word: '落寞', type: 'adj' }, { word: '酸涩', type: 'adj' },
      { word: '沉甸甸', type: 'adj' }, { word: '惆怅', type: 'emotion' }, { word: '难过', type: 'emotion' },
      { word: '孤独', type: 'emotion' }, { word: '流失', type: 'state' },
    ],
  },
  {
    keys: ['开心', '快乐', '高兴', '愉', '兴奋', '雀跃', '欢喜', '幸福', '甜', '松弛', '享受', '笑'],
    words: [
      { word: '欢笑', type: 'noun' }, { word: '雀跃', type: 'verb' }, { word: '甜蜜', type: 'adj' },
      { word: '明亮', type: 'adj' }, { word: '轻快', type: 'adj' }, { word: '欣喜', type: 'emotion' },
      { word: '自在', type: 'state' }, { word: '无忧', type: 'adj' }, { word: '眯眼', type: 'verb' },
      { word: '荡漾', type: 'state' },
    ],
  },
  {
    keys: ['想念', '怀念', '思念', '牵挂', '离', '别', '远'],
    words: [
      { word: '思念', type: 'emotion' }, { word: '牵挂', type: 'verb' }, { word: '旧照片', type: 'noun' },
      { word: '重逢', type: 'verb' }, { word: '回忆', type: 'noun' }, { word: '泛滥', type: 'state' },
      { word: '漫长', type: 'adj' },
    ],
  },
  {
    keys: ['平静', '放松', '闲', '悠', '躺', '发呆', '漫步', '自由', '轻松', '慢'],
    words: [
      { word: '慵懒', type: 'adj' }, { word: '闲适', type: 'adj' }, { word: '安宁', type: 'noun' },
      { word: '舒展', type: 'verb' }, { word: '呼吸', type: 'noun' }, { word: '漂浮', type: 'verb' },
      { word: '缓慢', type: 'adj' }, { word: '温柔', type: 'adj' },
    ],
  },
  {
    keys: ['怒', '气', '愤', '烦躁', '讨厌', '吼'],
    words: [
      { word: '火焰', type: 'noun' }, { word: '呐喊', type: 'verb' }, { word: '风暴', type: 'noun' },
      { word: '滚烫', type: 'adj' }, { word: '灼热', type: 'adj' }, { word: '咆哮', type: 'verb' },
    ],
  },
];

/** 中性诗性词：任何主题都可混入，保证随机性 */
const NEUTRAL: ThemeWord[] = [
  { word: '时间', type: 'abstract' }, { word: '梦', type: 'abstract' }, { word: '影子', type: 'noun' },
  { word: '光', type: 'noun' }, { word: '角落', type: 'location' }, { word: '沉默', type: 'emotion' },
  { word: '远方', type: 'location' }, { word: '清晨', type: 'time' }, { word: '黄昏', type: 'time' },
  { word: '微光', type: 'noun' }, { word: '回声', type: 'noun' }, { word: '季节', type: 'noun' },
  { word: '瞬间', type: 'time' }, { word: '气味', type: 'noun' }, { word: '温度', type: 'noun' },
  { word: '拾起', type: 'verb' }, { word: '折叠', type: 'verb' }, { word: '远去', type: 'verb' },
  { word: '漂浮', type: 'verb' }, { word: '凝望', type: 'verb' }, { word: '静止', type: 'state' },
  { word: '蔓延', type: 'state' }, { word: '尽头', type: 'location' }, { word: '透明', type: 'adj' },
  { word: '轻微', type: 'adj' }, { word: '无限', type: 'abstract' }, { word: '声音', type: 'noun' },
  { word: '窗台', type: 'location' }, { word: '口袋', type: 'noun' }, { word: '信件', type: 'noun' },
  { word: '齿轮', type: 'noun' }, { word: '手稿', type: 'noun' }, { word: '碑文', type: 'noun' },
  { word: '铅字', type: 'noun' }, { word: '屏幕', type: 'noun' }, { word: '音符', type: 'noun' },
];

function pickFallbackWords(scene: string, mood: string): ThemeWord[] {
  const text = scene + mood;
  const out: ThemeWord[] = [];
  const seen = new Set<string>();
  const push = (w: ThemeWord) => {
    if (!seen.has(w.word) && out.length < 48) {
      seen.add(w.word);
      out.push(w);
    }
  };
  for (const theme of FALLBACK_THEMES) {
    if (theme.keys.some((k) => text.includes(k))) theme.words.forEach(push);
  }
  for (const w of [...NEUTRAL].sort(() => Math.random() - 0.5)) {
    if (out.length >= 40) break;
    push(w);
  }
  return out;
}

/* ---------------- LLM 生成与解析 ---------------- */

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fallthrough */
  }
  const obj = cleaned.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      return JSON.parse(obj[0]);
    } catch {
      /* fallthrough */
    }
  }
  const arr = cleaned.match(/\[[\s\S]*\]/);
  if (arr) {
    try {
      return JSON.parse(arr[0]);
    } catch {
      /* fallthrough */
    }
  }
  return null;
}

function parseWords(text: string): ThemeWord[] {
  const data = extractJson(text) as { words?: unknown } | unknown[] | null;
  if (!data) return [];

  let raw: unknown[] = [];
  if (Array.isArray(data)) raw = data;
  else if (typeof data === 'object' && Array.isArray((data as { words?: unknown }).words)) {
    raw = (data as { words: unknown[] }).words;
  }

  const out: ThemeWord[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    let word = '';
    let type = '';
    if (typeof item === 'string') {
      word = item;
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      word = String(o.w ?? o.word ?? '').trim();
      type = String(o.t ?? o.type ?? '').trim().toLowerCase();
    }
    if (!word || word.length > 4 || seen.has(word)) continue;
    if (!/^[\u4e00-\u9fa5]{1,4}$/.test(word)) continue;
    if (BLACKLIST.has(word)) continue;
    if (!VALID_TYPES.has(type)) type = 'noun';
    seen.add(word);
    out.push({ word, type });
  }
  return out;
}

/**
 * LLM 双通道：
 * - 配置了 LLM_API_KEY → 走环境变量指定的 OpenAI 兼容接口（Vercel 等公网部署）
 * - 未配置 → 走运行环境内置 SDK（本地沙箱预览，零配置）
 * 任一通道失败均由上层 try/catch 兜底到本地主题词库，保证功能永远可用。
 */
async function askLLM(scene: string, mood: string): Promise<ThemeWord[]> {
  const apiKey = process.env.LLM_API_KEY?.trim();
  const completion = (await Promise.race([
    apiKey
      ? chatCompletionOpenAI({
          baseUrl: process.env.LLM_BASE_URL?.trim() || 'https://open.bigmodel.cn/api/paas/v4',
          apiKey,
          model: process.env.LLM_MODEL?.trim() || 'glm-4-flash',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `场景：${scene}\n情绪：${mood}` },
          ] satisfies ChatMessage[],
        })
      : (async () => {
          const zai = await ZAI.create();
          return zai.chat.completions.create({
            messages: [
              { role: 'assistant', content: SYSTEM_PROMPT },
              { role: 'user', content: `场景：${scene}\n情绪：${mood}` },
            ],
            thinking: { type: 'disabled' },
          }) as Promise<ChatCompletionResult>;
        })(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('LLM timeout')), 25000)),
  ])) as ChatCompletionResult;

  const text = completion.choices?.[0]?.message?.content ?? '';
  return parseWords(text);
}

/* ---------------- 路由 ---------------- */

export async function POST(req: NextRequest) {
  let body: { scene?: unknown; mood?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const scene = String(body.scene ?? '').trim().slice(0, 40);
  const mood = String(body.mood ?? '').trim().slice(0, 40);
  if (!scene || !mood) {
    return NextResponse.json({ error: 'scene and mood are required' }, { status: 400 });
  }

  let aiWords: ThemeWord[] = [];
  try {
    aiWords = await askLLM(scene, mood);
  } catch (err) {
    console.error('[poem-vocab] LLM failed:', err instanceof Error ? err.message : err);
  }

  if (aiWords.length >= 24) {
    return NextResponse.json({ words: ensureNouns(aiWords).slice(0, 52), source: 'ai' });
  }

  // LLM 产出不足：用本地词库补足，保证体验
  const have = new Set(aiWords.map((w) => w.word));
  const fallback = pickFallbackWords(scene, mood).filter((w) => !have.has(w.word));
  const merged = ensureNouns([...aiWords, ...fallback]).slice(0, 48);
  return NextResponse.json({
    words: merged,
    source: aiWords.length >= 12 ? 'ai-mixed' : 'fallback',
  });
}
