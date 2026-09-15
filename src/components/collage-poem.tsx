'use client';

/**
 * 拼贴诗 · 剪报诗笺
 * 从 upload/0909.txt 的单文件 HTML 版本移植为 React 组件。
 * - 点击词汇池中的纸片拾取词汇
 * - 在诗笺上长按拖动调整词序（鼠标）
 * - 自由书写：点击当前句空白处或词后光标，直接键入文字（Enter 落笔、
 *   Backspace 回删前段、Esc 收起、失焦自动提交；自由片段不回词汇池）
 * - 支持自录词库（localStorage 持久化，收录越多越易相遇）
 * - 结束全诗后进入全屏诗笺展示（Canvas 粒子），可下载 PNG
 * - 快捷键：R 换词 / L 结束当前句 / P 结束全诗 / Ctrl+Z 撤销 / Esc 返回
 *
 * 本组件通过 next/dynamic 以 ssr:false 渲染（见 src/app/page.tsx），
 * 仅在客户端执行，可在 useState 初始化器中安全访问 localStorage。
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import './collage-poem.css';

/* ---------------- 词库 ---------------- */

const WORD_POOL: ReadonlyArray<{ word: string; type: string }> = [
  { word: '月亮', type: 'noun' }, { word: '星辰', type: 'noun' },
  { word: '风', type: 'noun' }, { word: '雨', type: 'noun' },
  { word: '雪', type: 'noun' }, { word: '雾', type: 'noun' },
  { word: '海', type: 'noun' }, { word: '河流', type: 'noun' },
  { word: '山', type: 'noun' }, { word: '林', type: 'noun' },
  { word: '花', type: 'noun' }, { word: '叶', type: 'noun' },
  { word: '云', type: 'noun' }, { word: '影', type: 'noun' },
  { word: '光', type: 'noun' }, { word: '夜', type: 'noun' },
  { word: '晨', type: 'noun' }, { word: '黄昏', type: 'noun' },
  { word: '暮色', type: 'noun' }, { word: '露水', type: 'noun' },
  { word: '尘埃', type: 'noun' }, { word: '荒野', type: 'noun' },

  { word: '咖啡', type: 'noun' }, { word: '地铁', type: 'noun' },
  { word: '屏幕', type: 'noun' }, { word: '倒影', type: 'noun' },
  { word: '霓虹', type: 'noun' }, { word: '楼梯', type: 'noun' },
  { word: '阳台', type: 'noun' }, { word: '月台', type: 'noun' },
  { word: '车票', type: 'noun' }, { word: '末班车', type: 'noun' },
  { word: '行李', type: 'noun' }, { word: '便利店', type: 'noun' },
  { word: '耳机', type: 'noun' }, { word: '烟头', type: 'noun' },
  { word: '晚风', type: 'noun' }, { word: '闹钟', type: 'noun' },
  { word: '拖鞋', type: 'noun' }, { word: '早餐', type: 'noun' },
  { word: '雨伞', type: 'noun' }, { word: '街角', type: 'noun' },
  { word: '路灯', type: 'noun' }, { word: '信号', type: 'noun' },
  { word: '消息', type: 'noun' }, { word: '影子', type: 'noun' },

  /* 补充批：小物件/可触摸名词，增强拼贴的具体感 */
  { word: '纸鹤', type: 'noun' }, { word: '风筝', type: 'noun' },
  { word: '旧书', type: 'noun' }, { word: '信箱', type: 'noun' },
  { word: '邮筒', type: 'noun' }, { word: '船票', type: 'noun' },
  { word: '渡口', type: 'noun' }, { word: '站牌', type: 'noun' },
  { word: '钟摆', type: 'noun' }, { word: '沙漏', type: 'noun' },
  { word: '钥匙', type: 'noun' }, { word: '玻璃', type: 'noun' },
  { word: '芦苇', type: 'noun' }, { word: '萤火', type: 'noun' },
  { word: '野花', type: 'noun' }, { word: '麦田', type: 'noun' },
  { word: '贝壳', type: 'noun' }, { word: '羽毛', type: 'noun' },
  { word: '石子', type: 'noun' }, { word: '柑橘', type: 'noun' },
  { word: '茶杯', type: 'noun' }, { word: '毛衣', type: 'noun' },
  { word: '窗帘', type: 'noun' }, { word: '台灯', type: 'noun' },

  /* 补充批：现代·科技·社科·历史·人文名词，新旧意象交融 */
  { word: '代码', type: 'noun' }, { word: '电流', type: 'noun' },
  { word: '天线', type: 'noun' }, { word: '频率', type: 'noun' },
  { word: '快门', type: 'noun' }, { word: '胶片', type: 'noun' },
  { word: '磁带', type: 'noun' }, { word: '齿轮', type: 'noun' },
  { word: '引擎', type: 'noun' }, { word: '电梯', type: 'noun' },
  { word: '塔吊', type: 'noun' }, { word: '人群', type: 'noun' },
  { word: '街区', type: 'noun' }, { word: '码头', type: 'noun' },
  { word: '集市', type: 'noun' }, { word: '边界', type: 'noun' },
  { word: '时代', type: 'noun' }, { word: '碑文', type: 'noun' },
  { word: '青铜', type: 'noun' }, { word: '陶罐', type: 'noun' },
  { word: '卷轴', type: 'noun' }, { word: '遗址', type: 'noun' },
  { word: '城墙', type: 'noun' }, { word: '印章', type: 'noun' },
  { word: '诗集', type: 'noun' }, { word: '书页', type: 'noun' },
  { word: '铅字', type: 'noun' }, { word: '墨迹', type: 'noun' },
  { word: '手稿', type: 'noun' }, { word: '信笺', type: 'noun' },
  { word: '钢笔', type: 'noun' }, { word: '琴键', type: 'noun' },
  { word: '打字机', type: 'noun' }, { word: '图书馆', type: 'noun' },

  { word: '昨日', type: 'time' }, { word: '明日', type: 'time' },
  { word: '此刻', type: 'time' }, { word: '永远', type: 'time' },
  { word: '瞬间', type: 'time' }, { word: '千年', type: 'time' },
  { word: '刹那', type: 'time' }, { word: '深夜', type: 'time' },
  { word: '往昔', type: 'time' }, { word: '未来', type: 'time' },
  { word: '今天', type: 'time' }, { word: '昨天', type: 'time' },
  { word: '明天', type: 'time' }, { word: '周末', type: 'time' },
  { word: '凌晨', type: 'time' },

  { word: '孤独', type: 'emotion' }, { word: '思念', type: 'emotion' },
  { word: '寂静', type: 'emotion' }, { word: '忧伤', type: 'emotion' },
  { word: '欢愉', type: 'emotion' }, { word: '迷失', type: 'emotion' },
  { word: '等待', type: 'emotion' }, { word: '回忆', type: 'emotion' },
  { word: '惆怅', type: 'emotion' }, { word: '温柔', type: 'emotion' },
  { word: '疲倦', type: 'emotion' }, { word: '渴望', type: 'emotion' },
  { word: '沉默', type: 'emotion' }, { word: '心动', type: 'emotion' },
  { word: '无聊', type: 'emotion' }, { word: '释然', type: 'emotion' },

  { word: '飘落', type: 'verb' }, { word: '燃烧', type: 'verb' },
  { word: '流淌', type: 'verb' }, { word: '沉睡', type: 'verb' },
  { word: '苏醒', type: 'verb' }, { word: '凝望', type: 'verb' },
  { word: '远去', type: 'verb' }, { word: '归来', type: 'verb' },
  { word: '倾听', type: 'verb' }, { word: '触碰', type: 'verb' },
  { word: '拥抱', type: 'verb' }, { word: '消失', type: 'verb' },
  { word: '绽放', type: 'verb' }, { word: '凋零', type: 'verb' },
  { word: '坠落', type: 'verb' }, { word: '升起', type: 'verb' },
  { word: '游荡', type: 'verb' }, { word: '低语', type: 'verb' },
  { word: '穿过', type: 'verb' }, { word: '停留', type: 'verb' },
  { word: '发呆', type: 'verb' }, { word: '走神', type: 'verb' },
  { word: '叹气', type: 'verb' }, { word: '偷懒', type: 'verb' },
  { word: '摸鱼', type: 'verb' }, { word: '摆烂', type: 'verb' },
  { word: '熬夜', type: 'verb' }, { word: '加班', type: 'verb' },
  { word: '碎碎念', type: 'verb' }, { word: '独处', type: 'verb' },
  { word: '告别', type: 'verb' }, { word: '相遇', type: 'verb' },
  { word: '假装', type: 'verb' }, { word: '逃跑', type: 'verb' },

  { word: '梦', type: 'abstract' }, { word: '灵魂', type: 'abstract' },
  { word: '时间', type: 'abstract' }, { word: '记忆', type: 'abstract' },
  { word: '命运', type: 'abstract' }, { word: '空虚', type: 'abstract' },
  { word: '永恒', type: 'abstract' }, { word: '虚无', type: 'abstract' },
  { word: '回声', type: 'abstract' }, { word: '心事', type: 'abstract' },
  { word: '梦境', type: 'abstract' }, { word: '归宿', type: 'abstract' },
  { word: '生活', type: 'abstract' }, { word: '自由', type: 'abstract' },

  { word: '苍白', type: 'adj' }, { word: '深邃', type: 'adj' },
  { word: '遥远', type: 'adj' }, { word: '破碎', type: 'adj' },
  { word: '温暖', type: 'adj' }, { word: '冰冷', type: 'adj' },
  { word: '沉重', type: 'adj' }, { word: '透明', type: 'adj' },
  { word: '无声', type: 'adj' }, { word: '古老', type: 'adj' },
  { word: '无尽', type: 'adj' }, { word: '脆弱', type: 'adj' },
  { word: '静止', type: 'adj' }, { word: '随便', type: 'adj' },

  { word: '的', type: 'connector' }, { word: '地', type: 'connector' },
  { word: '得', type: 'connector' },

  { word: '与', type: 'connector' }, { word: '和', type: 'connector' },
  { word: '在', type: 'connector' }, { word: '像', type: 'connector' },
  { word: '如', type: 'connector' }, { word: '被', type: 'connector' },
  { word: '向', type: 'connector' }, { word: '于', type: 'connector' },
  { word: '而', type: 'connector' }, { word: '已', type: 'connector' },

  { word: '如果', type: 'connector' }, { word: '那么', type: 'connector' },
  { word: '虽然', type: 'connector' }, { word: '但是', type: 'connector' },
  { word: '既然', type: 'connector' }, { word: '就', type: 'connector' },
  { word: '因为', type: 'connector' }, { word: '所以', type: 'connector' },
  { word: '不但', type: 'connector' }, { word: '而且', type: 'connector' },
  { word: '只有', type: 'connector' }, { word: '才', type: 'connector' },
  { word: '无论', type: 'connector' }, { word: '都', type: 'connector' },
  { word: '即使', type: 'connector' }, { word: '也', type: 'connector' },
  { word: '只要', type: 'connector' }, { word: '却', type: 'connector' },
  { word: '还是', type: 'connector' }, { word: '或许', type: 'connector' },
  { word: '果然', type: 'connector' }, { word: '居然', type: 'connector' },
  { word: '原来', type: 'connector' }, { word: '算了', type: 'connector' },

  { word: '是', type: 'connector' }, { word: '有', type: 'connector' },
  { word: '存在', type: 'connector' }, { word: '在于', type: 'connector' },
  { word: '为', type: 'connector' }, { word: '没有', type: 'connector' },
  { word: '成为', type: 'connector' }, { word: '变成', type: 'connector' },

  { word: '这里', type: 'location' }, { word: '那里', type: 'location' },
  { word: '哪里', type: 'location' }, { word: '远方', type: 'location' },
  { word: '近处', type: 'location' }, { word: '边缘', type: 'location' },
  { word: '深处', type: 'location' }, { word: '尽头', type: 'location' },
  { word: '心中', type: 'location' }, { word: '梦里', type: 'location' },
  { word: '此地', type: 'location' }, { word: '彼方', type: 'location' },
  { word: '彼岸', type: 'location' }, { word: '途中', type: 'location' },
  { word: '之上', type: 'location' }, { word: '之下', type: 'location' },
  { word: '之中', type: 'location' }, { word: '之间', type: 'location' },
  { word: '之外', type: 'location' }, { word: '之内', type: 'location' },
  { word: '前方', type: 'location' }, { word: '身后', type: 'location' },
  { word: '高处', type: 'location' }, { word: '低处', type: 'location' },
  { word: '来处', type: 'location' }, { word: '归途', type: 'location' },

  { word: '静止', type: 'state' }, { word: '流动', type: 'state' },
  { word: '凝固', type: 'state' }, { word: '消散', type: 'state' },
  { word: '蔓延', type: 'state' }, { word: '停驻', type: 'state' },
  { word: '悬浮', type: 'state' }, { word: '沉陷', type: 'state' },
  { word: '浮现', type: 'state' }, { word: '隐匿', type: 'state' },
  { word: '纠缠', type: 'state' }, { word: '游离', type: 'state' },

  { word: '一', type: 'numeral' }, { word: '一场', type: 'numeral' },
  { word: '一个', type: 'numeral' }, { word: '一片', type: 'numeral' },
  { word: '一些', type: 'numeral' }, { word: '这', type: 'numeral' },
  { word: '那', type: 'numeral' }, { word: '谁', type: 'numeral' },
  { word: '什么', type: 'numeral' }, { word: '某个', type: 'numeral' },

  { word: '，', type: 'punct' }, { word: '。', type: 'punct' },
  { word: '？', type: 'punct' }, { word: '！', type: 'punct' },
  { word: '、', type: 'punct' }, { word: '；', type: 'punct' },
  { word: '：', type: 'punct' }, { word: '——', type: 'punct' },
  { word: '…', type: 'punct' }, { word: '「', type: 'punct' },
  { word: '」', type: 'punct' }, { word: '『', type: 'punct' },
  { word: '』', type: 'punct' }, { word: '（', type: 'punct' },
  { word: '）', type: 'punct' }, { word: '《', type: 'punct' },
  { word: '》', type: 'punct' }, { word: '·', type: 'punct' },
];

/* ---------------- 类型 ---------------- */

interface WordItem {
  uid: number;
  word: string;
  type: string;
  isUserWord: boolean;
  /** 是否参与入场 stagger 延迟（重新生成时 true，回池/新增时 false） */
  stagger: boolean;
  styleClass: string;
  /** 真实撕纸背景图（public/torn-user 下的用户原图，逐字节未处理） */
  bgUrl: string;
  /** 配合 bgUrl 的显示窗口：只展示原图中的纸片区域（文件零处理） */
  bgSize: string;
  bgPos: string;
  /** 自由书写片段：用户在诗行内直接键入的文字，不入词汇池 */
  isFreeText?: boolean;
}

interface UserVocabEntry {
  word: string;
  type: string;
  count: number;
}

interface Candidate {
  word: string;
  type: string;
  weight: number;
  isUserWord: boolean;
}

interface DragSession {
  uid: number;
  startX: number;
  startY: number;
  started: boolean;
  ghost: HTMLSpanElement;
  moveFn: (e: MouseEvent) => void;
  upFn: (e: MouseEvent) => void;
  targetUid: number | null;
  isBefore: boolean;
}

interface Particle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  alpha: number;
  alphaSpeed: number;
  color: readonly [number, number, number];
  glow: boolean;
}

/* 横格纸面上的一个逻辑条目 */
type FlowItem =
  | { kind: 'done'; key: string; idx: number; text: string; rows: number }
  | { kind: 'cur'; rows: number };

/* ---------------- 工具函数 ---------------- */

let uidSeq = 0;

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* 用户提供的真实撕纸素材原图（public/torn-user，逐字节未处理）。
   box = 纸片不透明区域在画布中的分数坐标 (x, y, w, h)，
   通过 background-size/position 只显示纸片区域（文件本身零处理）；
   ratio = 纸片区域宽高比，用于按卡槽分派避免拉伸变形。
   档位按词卡宽高比：a≈1.45 单字 / b≈2.2 双字 / c≈2.9 三字 / d≈4.2 四字+ */
interface TornOriginal {
  src: string;
  box: readonly [number, number, number, number];
  ratio: number;
}
const TORN_ORIGINALS: readonly TornOriginal[] = [
  { src: '/torn-user/t1.png', box: [0.1428, 0.0317, 0.8318, 0.5923], ratio: 2.38 },
  { src: '/torn-user/t2.png', box: [0.0868, 0.1223, 0.8108, 0.724], ratio: 3.09 },
  { src: '/torn-user/t3.png', box: [0.1682, 0.0933, 0.7577, 0.8123], ratio: 0.66 },
  { src: '/torn-user/t4.png', box: [0.0004, 0.0, 0.9996, 0.939], ratio: 1.54 },
  { src: '/torn-user/t5.png', box: [0.0741, 0.0929, 0.9231, 0.7308], ratio: 4.32 },
  { src: '/torn-user/t6.png', box: [0.0875, 0.1707, 0.8602, 0.6665], ratio: 2.47 },
  { src: '/torn-user/t7.png', box: [0.0742, 0.0927, 0.9251, 0.7342], ratio: 4.3 },
  { src: '/torn-user/t8.png', box: [0.1483, 0.3118, 0.7338, 0.3301], ratio: 3.23 },
];
const torn = (n: number) => TORN_ORIGINALS[n - 1];

/* 档位 → 候选素材（按纸片比例接近度分派，比例越接近拉伸越小）。
   竖构图的 t3（ratio 0.66）仅出现在最小卡槽 a 且占比最低，保留完整 8 张素材 */
const TORN_BAG_POOL: Record<'a' | 'b' | 'c' | 'd', readonly TornOriginal[]> = {
  a: [torn(4), torn(1), torn(6), torn(3)],
  b: [torn(6), torn(1), torn(2), torn(4)],
  c: [torn(2), torn(8), torn(6), torn(1)],
  d: [torn(7), torn(5), torn(8), torn(2)],
};
const TORN_ALL: readonly TornOriginal[] = TORN_ORIGINALS;

/** 撕纸档位：按词长（含破折号特殊宽度）选择最接近的纸片宽高比 */
function tornClassFor(word: string, type: string): 'a' | 'b' | 'c' | 'd' {
  if (type === 'punct' || type === 'connector') {
    if (word.length === 1) return 'a';
    if (word === '——') return 'b';
  }
  if (word.length <= 1) return 'a';
  if (word.length === 2) return 'b';
  if (word.length === 3) return 'c';
  return 'd';
}

/** 洗牌袋：同一档位内不重复地抽取素材，抽尽后重新洗牌，避免相邻词卡撞图 */
const tornBags = new Map<string, TornOriginal[]>();
function drawTorn(key: string, pool: readonly TornOriginal[]): TornOriginal {
  let bag = tornBags.get(key);
  if (!bag || bag.length === 0) {
    bag = shuffle(pool);
    tornBags.set(key, bag);
  }
  return bag.pop() as TornOriginal;
}

/** 由纸片区域分数坐标推导 background-size / position：
    size = 100/wh%，把纸片区域恰好铺满词卡；position 按 bx/(1-bw) 对齐窗口 */
function pickTornBg(word: string, type: string): Pick<WordItem, 'bgUrl' | 'bgSize' | 'bgPos'> {
  const cls = tornClassFor(word, type);
  const t = drawTorn(cls, TORN_BAG_POOL[cls]);
  const [bx, by, bw, bh] = t.box;
  return {
    bgUrl: t.src,
    bgSize: `${(100 / bw).toFixed(2)}% ${(100 / bh).toFixed(2)}%`,
    bgPos: `${((bx / (1 - bw)) * 100).toFixed(2)}% ${((by / (1 - bh)) * 100).toFixed(2)}%`,
  };
}

function preloadTornAssets(): void {
  if (typeof window === 'undefined') return;
  TORN_ALL.forEach((t) => {
    const img = new Image();
    img.src = t.src;
  });
}

function getStyleForType(type: string): string {
  const styles: Record<string, string[]> = {
    noun: ['style-headline', 'style-body', 'style-italic', 'style-stamp'],
    time: ['style-body', 'style-italic', 'style-faded', 'style-headline'],
    emotion: ['style-italic', 'style-body', 'style-headline', 'style-stamp'],
    verb: ['style-body', 'style-italic', 'style-faded', 'style-headline'],
    abstract: ['style-headline', 'style-body', 'style-italic', 'style-stamp'],
    adj: ['style-italic', 'style-faded', 'style-body'],
    connector: ['style-connector'],
    numeral: ['style-connector', 'style-faded'],
    punct: ['style-punct'],
    location: ['style-location', 'style-italic', 'style-faded'],
    state: ['style-italic', 'style-body', 'style-faded'],
  };
  const arr = styles[type] || ['style-body'];
  return arr[Math.floor(Math.random() * arr.length)];
}

function inferType(text: string): string {
  if (/^[，。？！、；：——…「」『』《》（）·！：；.]+$/.test(text)) return 'punct';
  const singleConn = ['的', '地', '得', '了', '着', '过', '是', '有', '在', '为', '和', '与', '或', '也', '都', '已', '才', '就', '却', '还', '把', '被', '让', '使', '向', '于', '而', '如', '像', '若', '虽', '但', '将'];
  if (singleConn.includes(text)) return 'connector';
  const multiConn = ['如果', '那么', '虽然', '但是', '既然', '因为', '所以', '不但', '而且', '只有', '无论', '即使', '只要', '还是', '或许', '存在', '在于', '没有', '成为', '变成', '于是', '然而', '况且', '何况', '果然', '居然', '原来', '算了'];
  if (multiConn.includes(text)) return 'connector';
  if (/[的地得]$/.test(text) && text.length > 1) return 'adj';
  if (/[上下中外内间前方后处]/.test(text) && text.length <= 3) {
    if (/^(这里|那里|哪里|远方|近处|边缘|深处|尽头|心中|梦里|此地|彼方|彼岸|途中|之上|之下|之中|之间|之外|之内|前方|身后|高处|低处|来处|归途)$/.test(text)) return 'location';
  }
  return 'noun';
}

function weightedShuffle<T extends Candidate>(arr: readonly T[]): T[] {
  return arr
    .map((item) => ({ item, key: Math.random() / Math.sqrt(item.weight || 1) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
}

function makeWordItem(word: string, type: string, isUserWord: boolean, stagger = true): WordItem {
  uidSeq += 1;
  return {
    uid: uidSeq,
    word,
    type,
    isUserWord,
    stagger,
    styleClass: getStyleForType(type),
    ...pickTornBg(word, type),
  };
}

/** 自由书写片段：用户在当前句内直接键入的文字，永远不回词汇池 */
function makeFreeItem(text: string): WordItem {
  uidSeq += 1;
  return {
    uid: uidSeq,
    word: text,
    type: 'free',
    isUserWord: false,
    stagger: false,
    styleClass: 'style-body',
    bgUrl: '',
    bgSize: '',
    bgPos: '',
    isFreeText: true,
  };
}

function buildCandidatePool(userVocab: UserVocabEntry[]): Candidate[] {
  const merged = new Map<string, Candidate>();
  WORD_POOL.forEach((w) => merged.set(w.word, { word: w.word, type: w.type, weight: 1, isUserWord: false }));
  userVocab.forEach((uw) => {
    const weight = Math.min(uw.count, 6);
    const type = uw.type || inferType(uw.word);
    const existing = merged.get(uw.word);
    if (existing) {
      existing.weight += weight;
      existing.isUserWord = true;
    } else {
      merged.set(uw.word, { word: uw.word, type, weight: 1 + weight, isUserWord: true });
    }
  });
  return Array.from(merged.values());
}

function ensureRequiredPunctuation(selected: Candidate[], typeCount: Record<string, number>): void {
  const inject = (word: string) => {
    if (!selected.some((w) => w.word === word)) {
      selected.push({ word, type: 'punct', weight: 1, isUserWord: false });
      typeCount.punct = (typeCount.punct || 0) + 1;
    }
  };
  inject('，');
  inject('。');
  const extraPunct = ['？', '！', '、', '——', '…'];
  inject(extraPunct[Math.floor(Math.random() * extraPunct.length)]);
  while (selected.length > 28) {
    const idx = selected.findIndex((w) => w.type !== 'punct' && w.type !== 'connector');
    if (idx > -1) selected.splice(idx, 1);
    else break;
  }
}

function generateWordItems(userVocab: UserVocabEntry[]): WordItem[] {
  const candidates = buildCandidatePool(userVocab);
  const ranked = weightedShuffle(candidates);
  const selected: Candidate[] = [];
  const typeCount: Record<string, number> = {};
  for (const w of ranked) {
    if (selected.length >= 24) break;
    const t = w.type;
    if (t === 'connector' && (typeCount[t] || 0) >= 6) continue;
    if (t === 'numeral' && (typeCount[t] || 0) >= 2) continue;
    if (t === 'punct' && (typeCount[t] || 0) >= 3) continue;
    if (t === 'adj' && (typeCount[t] || 0) >= 3) continue;
    if (t === 'location' && (typeCount[t] || 0) >= 3) continue;
    if (t === 'state' && (typeCount[t] || 0) >= 2) continue;
    selected.push(w);
    typeCount[t] = (typeCount[t] || 0) + 1;
  }
  ensureRequiredPunctuation(selected, typeCount);
  return shuffle(selected).map((w) => makeWordItem(w.word, w.type, w.isUserWord, true));
}

/** 开始界面的主题词库 → 词汇池：主题词为主 + 基础连接词 + 自录词加成，配额与默认池一致 */
function generateThemedItems(
  themeWords: ReadonlyArray<{ word: string; type: string }>,
  userVocab: UserVocabEntry[],
): WordItem[] {
  const merged = new Map<string, Candidate>();
  themeWords.forEach((w) => {
    if (!merged.has(w.word)) {
      merged.set(w.word, { word: w.word, type: w.type, weight: 1, isUserWord: false });
    }
  });
  // 主题词库不含连接词：从基础词库随机补充（低权重，只占少量席位）
  const connectors = shuffle(WORD_POOL.filter((w) => w.type === 'connector'))
    .slice(0, 14)
    .forEach((w) => merged.set(w.word, { word: w.word, type: w.type, weight: 0.7, isUserWord: false }));
  void connectors;
  // 主题词可能偏动词/形容词：从基础词库随机补充名词（低权重），保证纸片里有足够的具体名词
  const nounTopUp = shuffle(WORD_POOL.filter((w) => w.type === 'noun'))
    .slice(0, 10)
    .forEach((w) => {
      if (!merged.has(w.word)) merged.set(w.word, { word: w.word, type: w.type, weight: 0.7, isUserWord: false });
    });
  void nounTopUp;
  // 自录词库照常生效：收录越多越易相遇
  userVocab.forEach((uw) => {
    const weight = Math.min(uw.count, 6);
    const existing = merged.get(uw.word);
    if (existing) {
      existing.weight += weight;
      existing.isUserWord = true;
    } else {
      merged.set(uw.word, { word: uw.word, type: uw.type || inferType(uw.word), weight: 1 + weight, isUserWord: true });
    }
  });
  const ranked = weightedShuffle(Array.from(merged.values()));
  const selected: Candidate[] = [];
  const typeCount: Record<string, number> = {};
  for (const w of ranked) {
    if (selected.length >= 24) break;
    const t = w.type;
    if (t === 'connector' && (typeCount[t] || 0) >= 6) continue;
    if (t === 'numeral' && (typeCount[t] || 0) >= 2) continue;
    if (t === 'punct' && (typeCount[t] || 0) >= 3) continue;
    if (t === 'adj' && (typeCount[t] || 0) >= 4) continue;
    if (t === 'location' && (typeCount[t] || 0) >= 3) continue;
    if (t === 'state' && (typeCount[t] || 0) >= 3) continue;
    selected.push(w);
    typeCount[t] = (typeCount[t] || 0) + 1;
  }
  ensureRequiredPunctuation(selected, typeCount);
  return shuffle(selected).map((w) => makeWordItem(w.word, w.type, w.isUserWord, true));
}

/** 读取 next/font 生成的 font-family 变量（用于 Canvas 绘制） */
function getFontVar(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}

/** 从 localStorage 载入自录词库（本组件以 ssr:false 渲染，仅在客户端执行） */
function loadVocab(): UserVocabEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('collagePoemVocab') || '[]');
    if (Array.isArray(parsed)) return parsed as UserVocabEntry[];
    return [];
  } catch {
    return [];
  }
}

/** 展示用日期：年/月/日均为阿拉伯数字（如 2025年9月9日），不用汉字数字 */
function fmtDateCN(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 文件名用日期（如 2025.09.09），避免「年月日」等字符进入下载文件名 */
function fmtDateFile(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}`;
}

/* ------------------------------------------------------------------
   横格纸几何常量（源自 lined-paper.jpg 2974×4094 实测，
   与 collage-poem.css 中 .sheet-paper/.sheet-flow 数值同步）：
   - 正文 19 条横线，行距 172.17px → 5.789cqw，首线 y=683
   - 文字左右边距 8cqw，字号 2.8cqw（最小 12px），字距 0.35cqw
   ------------------------------------------------------------------ */
const SHEET = {
  rowCqw: 5.789,
  padCqw: 8,
  fontCqw: 2.8,
  minFontPx: 12,
  lsCqw: 0.35,
  slots: 19,
  maxWidth: 780,
  /** 页眉高度 = 首行书写区顶部 17.18cqw（与 .sheet-paper 同步） */
  textTopCqw: 17.18,
  /** 整张纸的完整高度（含页脚标尺）137.66cqw */
  fullHeightCqw: 137.66,
  /** 空白纸张最少可见行数：初始约整张纸的 1/4~1/3 长度 */
  minVisRows: 4,
} as const;

let measureCtxCache: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtxCache) return measureCtxCache;
  if (typeof document === 'undefined') return null;
  measureCtxCache = document.createElement('canvas').getContext('2d');
  return measureCtxCache;
}

function sheetFontPx(sheetW: number): number {
  return Math.max((SHEET.fontCqw * sheetW) / 100, SHEET.minFontPx);
}

function measureWidthPx(text: string, sheetW: number): number {
  const ctx = getMeasureCtx();
  const px = sheetFontPx(sheetW);
  if (!ctx) return text.length * px;
  ctx.font = `400 ${px}px ${getFontVar('--font-huiwen', '"Huiwen-mincho"')}, serif`;
  return ctx.measureText(text).width;
}

/** 已完成句占用行数：句首序号圆点 + 句尾清除按钮约占 3.2em，另留 6% 安全余量 */
function estDoneRows(text: string, sheetW: number): number {
  const px = sheetFontPx(sheetW);
  const ls = (SHEET.lsCqw * sheetW) / 100;
  const avail = sheetW * (1 - (SHEET.padCqw * 2) / 100);
  const total = (measureWidthPx(text, sheetW) + ls * text.length + px * 3.2) * 1.06;
  return Math.max(1, Math.ceil(total / avail));
}

/** 当前句占用行数：词间距/内边距约占每词 0.95em */
function estCurRows(words: readonly WordItem[], sheetW: number): number {
  const px = sheetFontPx(sheetW);
  const ls = (SHEET.lsCqw * sheetW) / 100;
  const avail = sheetW * (1 - (SHEET.padCqw * 2) / 100);
  let w = 0;
  words.forEach((x) => {
    w += measureWidthPx(x.word, sheetW) + px * 0.95;
  });
  w += ls * words.reduce((s, x) => s + x.word.length, 0);
  return Math.max(1, Math.ceil((w * 1.06) / avail));
}

/* ---------------- 组件 ---------------- */

export default function CollagePoem() {
  const [userVocab, setUserVocab] = useState<UserVocabEntry[]>(() => loadVocab());
  const [poolWords, setPoolWords] = useState<WordItem[]>(() => generateWordItems(loadVocab()));
  const [currentLine, setCurrentLine] = useState<WordItem[]>([]);
  const [completedLines, setCompletedLines] = useState<WordItem[][]>([]);
  const [flyingUids, setFlyingUids] = useState<ReadonlySet<number>>(new Set());
  const [removingLines, setRemovingLines] = useState<ReadonlySet<number>>(new Set());
  const [draggingUid, setDraggingUid] = useState<number | null>(null);
  /* ---- 移动端：长按拖拽与系统长按复制冲突 → 改为点击词汇弹出 ←/→/× 操作钮 ---- */
  const [isMobile, setIsMobile] = useState(false);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const isMobileRef = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => {
      setIsMobile(mq.matches);
      isMobileRef.current = mq.matches;
      if (!mq.matches) setSelectedUid(null);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  const [toastText, setToastText] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [poemActive, setPoemActive] = useState(false);
  const [poemOpenCount, setPoemOpenCount] = useState(0);
  const [dateStr, setDateStr] = useState(() => fmtDateCN(new Date()));
  const [inputValue, setInputValue] = useState('');
  const [poemTitle, setPoemTitle] = useState('');
  const [sheetW, setSheetW] = useState(0);
  const [fontsTick, setFontsTick] = useState(0);
  const [caretIndex, setCaretIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [draftW, setDraftW] = useState(26);
  /* ---- 开始界面：场景 + 情绪 → 主题词库 ---- */
  const [phase, setPhase] = useState<'intro' | 'editor'>('intro');
  const [sceneInput, setSceneInput] = useState('');
  const [moodInput, setMoodInput] = useState('');
  const [starting, setStarting] = useState(false);
  const [introHint, setIntroHint] = useState('');

  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const poemDisplayRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const freeInputRef = useRef<HTMLInputElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  /** 当前主题词库（来自开始界面），词汇生成/再作一首时复用 */
  const themeWordsRef = useRef<ReadonlyArray<{ word: string; type: string }> | null>(null);
  /** 生成当前词库所用的场景/情绪：返回首页后原样再点「开始写诗」即视为继续上次 */
  const lastSceneRef = useRef('');
  const lastMoodRef = useRef('');
  const sceneRef = useRef<HTMLInputElement | null>(null);
  const moodRef = useRef<HTMLInputElement | null>(null);

  /* ---- 自录词库持久化 ---- */
  useEffect(() => {
    try {
      localStorage.setItem('collagePoemVocab', JSON.stringify(userVocab));
    } catch {
      /* 隐私模式等场景下静默失败 */
    }
  }, [userVocab]);

  /* ---- 预载撕纸背景素材（首次渲染即缓存，避免词卡背景闪现） ---- */
  useEffect(() => {
    preloadTornAssets();
  }, []);

  /* ---- 纸张实际宽度追踪（横线对齐与分页估算依赖）----
     phase 进入 editor 后 .creation-area 才挂载，故依赖 phase 重新绑定 */
  useEffect(() => {
    if (phase !== 'editor') return;
    const el = areaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setSheetW(Math.min(el.clientWidth, SHEET.maxWidth));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  /* ---- 字体就绪后重算一次行数估算（webfont 与回退字体宽度略有差异） ---- */
  useEffect(() => {
    let alive = true;
    document.fonts?.ready
      .then(() => {
        if (alive) setFontsTick((t) => t + 1);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /* ---- Toast ---- */
  const showToast = useCallback((msg: string) => {
    setToastText(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2000);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  /* ---- 开始写诗：按场景+情绪生成主题词库，随后进入创作页 ---- */
  const startPoem = useCallback(async () => {
    if (starting) return;
    const scene = sceneInput.trim();
    const mood = moodInput.trim();
    if (!scene || !mood) {
      setIntroHint('两个问题都写下，词语才会找到你…');
      return;
    }
    /* 场景与情绪都未改动且词库已备好 → 视为「回到上次」：诗句与词汇池原样保留，无需重新生成 */
    if (themeWordsRef.current && scene === lastSceneRef.current && mood === lastMoodRef.current) {
      setIntroHint('');
      setPhase('editor');
      showToast('回到你的诗笺 · 继续拼贴');
      return;
    }
    setIntroHint('');
    setStarting(true);
    try {
      const res = await fetch('/api/poem-vocab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene, mood }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { words?: { word: string; type: string }[]; source?: string };
      if (!data.words || data.words.length < 12) throw new Error('词库为空');
      themeWordsRef.current = data.words;
      lastSceneRef.current = scene;
      lastMoodRef.current = mood;
      setPoolWords(generateThemedItems(data.words, userVocab));
      const keptLines = completedLines.length > 0 || currentLine.length > 0;
      showToast(
        data.source === 'fallback'
          ? '已备好词语 · 离线词库'
          : keptLines
            ? '词语已换新 · 原诗句仍保留'
            : '词语已备好 · 开始拼贴',
      );
    } catch {
      // 接口失败不阻塞创作：退回经典词库
      themeWordsRef.current = null;
      setPoolWords(generateWordItems(userVocab));
      showToast('词库生成未成功 · 已用经典词库');
    } finally {
      setStarting(false);
      setPhase('editor');
    }
  }, [starting, sceneInput, moodInput, userVocab, completedLines, currentLine, showToast]);

  /* ---- 词汇生成 ---- */
  const regen = useCallback(() => {
    const theme = themeWordsRef.current;
    setPoolWords(theme ? generateThemedItems(theme, userVocab) : generateWordItems(userVocab));
    showToast('词汇已重新洗牌');
  }, [userVocab, showToast]);

  /* ---- 拾取词汇 ---- */
  const pickWord = useCallback((w: WordItem) => {
    setCurrentLine((prev) => [...prev, w]);
    setFlyingUids((prev) => new Set(prev).add(w.uid));
    window.setTimeout(() => {
      setPoolWords((prev) => prev.filter((p) => p.uid !== w.uid));
      setFlyingUids((prev) => {
        const next = new Set(prev);
        next.delete(w.uid);
        return next;
      });
    }, 500);
  }, []);

  /* ---- 词回池（自由书写片段不入池） ---- */
  const addWordBackToPool = useCallback((w: WordItem) => {
    if (w.isFreeText) return;
    setPoolWords((prev) => {
      if (prev.some((p) => p.word === w.word)) return prev;
      return [...prev, { ...w, stagger: false }];
    });
  }, []);

  /* ---- 从当前句移除词 ---- */
  const removeWordFromLine = useCallback(
    (uid: number) => {
      const w = currentLine.find((x) => x.uid === uid);
      if (!w) return;
      setCurrentLine((prev) => prev.filter((x) => x.uid !== uid));
      addWordBackToPool(w);
    },
    [currentLine, addWordBackToPool],
  );

  /* ---- 当前句内拖动排序（鼠标） ---- */

  const onWordMouseMove = useCallback((ev: MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = ev.clientX - d.startX;
    const dy = ev.clientY - d.startY;

    if (!d.started && Math.hypot(dx, dy) > 5) {
      d.started = true;
      document.body.appendChild(d.ghost);
      setDraggingUid(d.uid);
    }
    if (!d.started) return;

    ev.preventDefault();
    d.ghost.style.transform = `translate(${dx}px, ${dy}px)`;

    const elem = document.elementFromPoint(ev.clientX, ev.clientY);
    document.querySelectorAll('.drag-indicator').forEach((el) => el.remove());

    const targetWord = elem instanceof Element ? elem.closest('.current-word') : null;

    if (
      targetWord instanceof HTMLElement &&
      targetWord.dataset.uid &&
      Number(targetWord.dataset.uid) !== d.uid
    ) {
      const targetRect = targetWord.getBoundingClientRect();
      const midX = targetRect.left + targetRect.width / 2;
      const isBefore = ev.clientX < midX;

      const indicator = document.createElement('div');
      indicator.className = 'drag-indicator';
      indicator.style.top = `${targetRect.top}px`;
      indicator.style.height = `${targetRect.height}px`;
      indicator.style.left = `${isBefore ? targetRect.left : targetRect.right}px`;
      document.body.appendChild(indicator);

      d.targetUid = Number(targetWord.dataset.uid);
      d.isBefore = isBefore;
    } else {
      d.targetUid = null;
    }
  }, []);

  const onWordMouseUp = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    document.removeEventListener('mousemove', d.moveFn);
    document.removeEventListener('mouseup', d.upFn);

    if (d.started) {
      document.querySelectorAll('.drag-indicator').forEach((el) => el.remove());
      if (d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
      setDraggingUid(null);

      if (d.targetUid !== null) {
        const fromUid = d.uid;
        const toUid = d.targetUid;
        const before = d.isBefore;
        setCurrentLine((prev) => {
          const from = prev.findIndex((w) => w.uid === fromUid);
          if (from < 0) return prev;
          const arr = [...prev];
          const [moved] = arr.splice(from, 1);
          const to = arr.findIndex((w) => w.uid === toUid);
          if (to < 0) return prev;
          arr.splice(before ? to : to + 1, 0, moved);
          return arr;
        });
      }
    }
    dragRef.current = null;
  }, []);

  const onWordMouseDown = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      /* 移动端：拖拽停用（与系统长按复制冲突），改为点选 + 弹出操作钮 */
      if (isMobileRef.current) return;
      const target = e.target as HTMLElement;
      if (target.closest('.remove-icon') || target.closest('.drag-tooltip') || target.closest('.insert-caret')) return;
      if (e.button !== 0) return;

      const span = e.currentTarget;
      const uid = Number(span.dataset.uid);
      const word = span.dataset.word || '';
      const rect = span.getBoundingClientRect();

      const ghost = document.createElement('span');
      ghost.className = 'current-word';
      ghost.textContent = word;
      ghost.style.position = 'fixed';
      ghost.style.left = `${rect.left}px`;
      ghost.style.top = `${rect.top}px`;
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      ghost.style.zIndex = '9999';
      ghost.style.pointerEvents = 'none';
      ghost.style.opacity = '0.85';
      ghost.style.background = 'rgba(168, 40, 30, 0.1)';
      ghost.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      ghost.style.borderRadius = '2px';
      ghost.style.margin = '0';

      const moveFn = (ev: MouseEvent) => onWordMouseMove(ev);
      const upFn = () => onWordMouseUp();

      dragRef.current = {
        uid,
        startX: e.clientX,
        startY: e.clientY,
        started: false,
        ghost,
        moveFn,
        upFn,
        targetUid: null,
        isBefore: false,
      };

      document.addEventListener('mousemove', moveFn);
      document.addEventListener('mouseup', upFn);
    },
    [onWordMouseMove, onWordMouseUp],
  );

  /* 移动端操作钮：左右移动词汇（选中态保持在该词上，可连续点按） */
  const moveWord = useCallback((uid: number, dir: -1 | 1) => {
    setCurrentLine((prev) => {
      const i = prev.findIndex((w) => w.uid === uid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const arr = [...prev];
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  }, []);

  /* ---- 结束当前句 / 结束全诗 ---- */

  const endLine = useCallback(() => {
    if (currentLine.length === 0) {
      showToast('当前诗句为空 · 请先拾取词汇');
      return;
    }
    setSelectedUid(null);
    setCompletedLines((prev) => [...prev, currentLine]);
    setCurrentLine([]);
    showToast('当前句已成 · 继续下一句');
  }, [currentLine, showToast]);

  const endPoem = useCallback(() => {
    const lines = currentLine.length > 0 ? [...completedLines, currentLine] : completedLines;
    if (currentLine.length > 0) {
      setCompletedLines(lines);
      setCurrentLine([]);
    }
    if (lines.length === 0) {
      showToast('诗歌尚是空白 · 先拾几个词吧');
      return;
    }
    if (poemDisplayRef.current) poemDisplayRef.current.scrollTop = 0; // 每次打开回到诗笺顶部
    setPoemActive(true);
    setPoemOpenCount((c) => c + 1);
  }, [currentLine, completedLines, showToast]);

  const newPoem = useCallback(() => {
    setPoemActive(false);
    window.setTimeout(() => {
      setCurrentLine([]);
      setCompletedLines([]);
      const theme = themeWordsRef.current;
      setPoolWords(theme ? generateThemedItems(theme, userVocab) : generateWordItems(userVocab));
    }, 400);
  }, [userVocab]);

  const closeDisplay = useCallback(() => setPoemActive(false), []);

  /* ---- 清除已完成句 ---- */

  const removeLine = useCallback(
    (idx: number) => {
      setRemovingLines((prev) => new Set(prev).add(idx));
      window.setTimeout(() => {
        setCompletedLines((prev) => prev.filter((_, i) => i !== idx));
        setRemovingLines((prev) => {
          const next = new Set(prev);
          next.delete(idx);
          return next;
        });
        showToast(`已清除第 ${idx + 1} 句`);
      }, 320);
    },
    [showToast],
  );

  /* ---- 取回已完成句再编辑：词句回到当前句，可调序 / 单个删除 / 继续添加 ---- */

  const editLine = useCallback(
    (idx: number) => {
      if (currentLine.length > 0) {
        showToast('请先结束或清空当前句 · 再取回已完成句');
        return;
      }
      const line = completedLines[idx];
      if (!line || line.length === 0) return;
      setCompletedLines((prev) => prev.filter((_, i) => i !== idx));
      setCurrentLine(line);
      showToast(`已取回第 ${idx + 1} 句 · 可调整语序或增删词语`);
    },
    [currentLine, completedLines, showToast],
  );

  /* ---- 自由书写：点击当前句空白处或词后光标，直接键入文字 ---- */

  const openCaret = useCallback((idx: number) => {
    setDraft('');
    setCaretIndex(Math.max(0, idx));
  }, []);

  const closeCaret = useCallback(() => {
    setCaretIndex(null);
    setDraft('');
  }, []);

  /* ---- 返回首页（开始界面）：诗句与词池原样保留，随时可继续 ---- */

  const goHome = useCallback(() => {
    closeCaret(); // 收起自由书写光标
    setIntroHint('');
    setPhase('intro');
    window.scrollTo({ top: 0 });
  }, [closeCaret]);

  /** 生成页（全屏诗笺）直接返回首页：收起诗笺并回到开始界面，诗句保留 */
  const goHomeFromPoem = useCallback(() => {
    setPoemActive(false);
    goHome();
  }, [goHome]);

  /** 提交草稿为自由书写片段；keepTyping=true 时光标留在片段后继续输入 */
  const commitDraft = useCallback(
    (keepTyping: boolean) => {
      const text = draft.trim();
      if (!text) {
        if (!keepTyping) closeCaret();
        return;
      }
      const at = Math.min(Math.max(caretIndex ?? currentLine.length, 0), currentLine.length);
      const item = makeFreeItem(text);
      setCurrentLine((prev) => {
        const arr = [...prev];
        arr.splice(Math.min(Math.max(caretIndex ?? prev.length, 0), prev.length), 0, item);
        return arr;
      });
      setDraft('');
      if (keepTyping) setCaretIndex(at + 1);
      else setCaretIndex(null);
    },
    [draft, caretIndex, currentLine.length, closeCaret],
  );

  const onDraftKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitDraft(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeCaret();
      } else if (e.key === 'Backspace' && draft.length === 0) {
        // 空草稿时回删：删除光标前的词段（池词回池，自由片段直接移除）
        e.preventDefault();
        if (caretIndex === null || caretIndex === 0) return;
        const w = currentLine[caretIndex - 1];
        if (!w) return;
        setCurrentLine((prev) => prev.filter((x) => x.uid !== w.uid));
        if (!w.isFreeText) addWordBackToPool(w);
        setCaretIndex(caretIndex - 1);
      }
    },
    [draft, caretIndex, currentLine, commitDraft, closeCaret, addWordBackToPool],
  );

  /** 点击当前句空白处：按点击位置计算插入下标（词中点以左=插到该词前） */
  const onCurLineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('.current-word') ||
        target.closest('.word-actions') ||
        target.closest('.remove-icon') ||
        target.closest('.insert-caret') ||
        target.closest('.free-input')
      ) {
        return;
      }
      setSelectedUid(null);
      const chips = Array.from(e.currentTarget.querySelectorAll('.current-word')) as HTMLElement[];
      let idx = chips.length;
      for (let i = 0; i < chips.length; i++) {
        const r = chips[i].getBoundingClientRect();
        if (e.clientX < r.left + r.width / 2) {
          idx = i;
          break;
        }
      }
      openCaret(idx);
    },
    [openCaret],
  );

  /* 光标位置变化后聚焦输入框，并把插入点移到末尾 */
  useEffect(() => {
    if (caretIndex === null) return;
    const el = freeInputRef.current;
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [caretIndex]);

  /* 草稿宽度自适应：用同字体隐藏量宽元素测量 */
  useEffect(() => {
    if (caretIndex === null) return;
    if (measureRef.current) setDraftW(measureRef.current.offsetWidth);
  }, [draft, caretIndex]);

  /* ---- 自录词汇 ---- */

  const addUserWord = useCallback(() => {
    const text = inputValue.trim();
    if (!text) {
      showToast('请输入词汇');
      return;
    }
    if (text.length > 6) {
      showToast('词汇过长 · 最多 6 字');
      return;
    }
    const type = inferType(text);
    setUserVocab((prev) => {
      const existing = prev.find((v) => v.word === text);
      if (existing) {
        return prev.map((v) => (v.word === text ? { ...v, count: Math.min(v.count + 1, 10) } : v));
      }
      return [...prev, { word: text, type, count: 1 }];
    });
    setPoolWords((prev) => {
      if (prev.some((p) => p.word === text)) return prev;
      return [...prev, makeWordItem(text, type, true, false)];
    });
    setInputValue('');
    showToast(`已收录「${text}」 · 此后更易相遇`);
  }, [inputValue, showToast]);

  const clearUserVocab = useCallback(() => {
    if (userVocab.length === 0) {
      showToast('词库尚为空白');
      return;
    }
    setUserVocab([]);
    showToast('已清空自录词库');
  }, [userVocab.length, showToast]);

  /* ---- 全屏诗笺粒子背景 ---- */

  useEffect(() => {
    if (!poemActive) return;
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles: Particle[] = [];
    const particleCount = Math.min(90, Math.floor((window.innerWidth * window.innerHeight) / 18000));
    for (let i = 0; i < particleCount; i++) {
      const isRed = Math.random() > 0.6;
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.6 + 0.4,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35 - 0.05,
        alpha: Math.random() * 0.3 + 0.14,
        alphaSpeed: (Math.random() - 0.5) * 0.009,
        color: isRed ? [168, 40, 30] : [146, 116, 62],
        glow: false,
      });
    }

    let rafId = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha += p.alphaSpeed;
        if (p.alpha < 0.08 || p.alpha > 0.5) p.alphaSpeed *= -1;
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
        if (p.y < -10) p.y = canvas.height + 10;
        if (p.y > canvas.height + 10) p.y = -10;
        const glowR = Math.max(0.5, p.r * 6);
        if (p.glow) {
          const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
          gradient.addColorStop(0, `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, ${p.alpha * 0.45})`);
          gradient.addColorStop(1, `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, 0)`);
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.2, p.r), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, ${p.alpha})`;
        ctx.fill();
      });
      rafId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [poemActive]);

  /* ---- 下载诗意图片 ---- */

  const downloadPoemImage = useCallback(async () => {
    showToast('正在生成图片...');
    try {
      await document.fonts.ready;
      const serifForLoad = getFontVar('--font-huiwen', '"Huiwen-mincho"');
      await document.fonts.load(`400 30px ${serifForLoad}`);
      await document.fonts.load(`700 16px ${serifForLoad}`);
      await document.fonts.load(`400 14px ${serifForLoad}`);
      await document.fonts.load(`700 24px ${serifForLoad}`);
    } catch {
      /* 字体加载失败不阻塞导出 */
    }

    const lines = completedLines.map((line) => line.map((w) => w.word).join(''));
    const serif = getFontVar('--font-huiwen', '"Huiwen-mincho"');

    const scale = 2;
    const W = 900 * scale;
    const padY = 60 * scale;

    // 字号层级：标题略大于正文诗句，落款小于正文——
    // 诗句按最长行动态缩放，目标最长行约占画布宽 42%（再次调小），字号限 44~92
    const maxLineLen = lines.reduce((m, l) => Math.max(m, l.length), 1);
    const lineFontSize = Math.round(Math.min(46 * scale, Math.max(22 * scale, (W * 0.42) / (maxLineLen * 1.08))));
    const lineGap = Math.round(lineFontSize * 0.5);
    // 标题约 1.15 倍正文（略大）；超长标题（最长 24 字）按画布宽度预算收敛防出框
    const titleLen = (poemTitle.trim() || '无题').length;
    const titleFontSize = Math.max(
      20 * scale,
      Math.min(Math.round(lineFontSize * 1.15), Math.floor((W * 0.88) / (titleLen * 1.5 + 1.2)))
    );
    // 落款比旧版（30px）调大，但始终小于正文诗句字号
    const sigFontSize = Math.round(Math.min(22 * scale, Math.max(17 * scale, lineFontSize * 0.42)));
    const titleBlockH = Math.round(titleFontSize * 2.1);
    // 落款区（分隔线 + 落款文字，无印章）
    const sigBlockH = Math.round(lineFontSize * 0.28 + sigFontSize * 1.5 + 20 * scale);
    const linesBlockH = lines.length * (lineFontSize + lineGap);
    // 标题与正文之间空两行（两倍行距）
    const gapTitleLines = (lineFontSize + lineGap) * 2;
    // 竖版画布：最小高度取背景原图比例（4365×6000），诗句更长时随内容增高
    const contentH = padY + titleBlockH + gapTitleLines + linesBlockH + sigBlockH + padY;
    const minH = Math.round((W * 6000) / 4365);
    const H = Math.max(contentH, minH);
    // 内容块在竖版纸面垂直居中、略偏上（光学中心）
    const topY = Math.round((H - contentH) * 0.46);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 诗作纸面：用户提供的折痕白纸原图（与生成页背景同一文件），加载失败时回退纯色
    const texture = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = '/poem-bg.png';
    });
    if (texture) {
      const coverScale = Math.max(W / texture.width, H / texture.height);
      const dw = texture.width * coverScale;
      const dh = texture.height * coverScale;
      ctx.drawImage(texture, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = '#f1f1f3';
      ctx.fillRect(0, 0, W, H);
    }

    const cornerGrad1 = ctx.createRadialGradient(W * 0.15, H * 0.15, 0, W * 0.15, H * 0.15, W * 0.4);
    cornerGrad1.addColorStop(0, 'rgba(168, 40, 30, 0.08)');
    cornerGrad1.addColorStop(1, 'rgba(168, 40, 30, 0)');
    ctx.fillStyle = cornerGrad1;
    ctx.fillRect(0, 0, W, H);

    const cornerGrad2 = ctx.createRadialGradient(W * 0.85, H * 0.85, 0, W * 0.85, H * 0.85, W * 0.4);
    cornerGrad2.addColorStop(0, 'rgba(184, 134, 11, 0.06)');
    cornerGrad2.addColorStop(1, 'rgba(184, 134, 11, 0)');
    ctx.fillStyle = cornerGrad2;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 80; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = (Math.random() * 1.5 + 0.4) * scale;
      const alpha = Math.random() * 0.3 + 0.12;
      const isRed = Math.random() > 0.6;
      const color = isRed ? [168, 40, 30] : [146, 116, 62];
      const hasGlow = false;
      if (hasGlow) {
        const glowR = Math.max(1, r * 5);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
        glow.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha * 0.4})`);
        glow.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.3, r), 0, Math.PI * 2);
      ctx.fill();
    }

    const titleY = topY + padY + Math.round(titleBlockH * 0.5);
    const customTitle = poemTitle.trim();
    const titleText = customTitle ? customTitle.split('').join(' ') : '无  题';
    ctx.font = `700 ${titleFontSize}px ${serif}, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 无外框；标题用更暗的红棕色
    ctx.fillStyle = '#7a2d20';
    ctx.fillText(titleText, W / 2, titleY);

    ctx.font = `400 ${lineFontSize}px ${serif}, serif`;
    ctx.fillStyle = '#2c2418';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 字距 0.06em（Canvas letterSpacing 可用时生效，与估算公式一致；此前 0.12em 偏疏）
    const hasLS = 'letterSpacing' in ctx;
    if (hasLS) ctx.letterSpacing = `${Math.round(lineFontSize * 0.06)}px`;
    lines.forEach((line, i) => {
      const y = topY + padY + titleBlockH + gapTitleLines + i * (lineFontSize + lineGap) + lineFontSize / 2;
      ctx.fillText(line, W / 2, y);
    });
    if (hasLS) ctx.letterSpacing = '0px';

    const dividerY = topY + padY + titleBlockH + gapTitleLines + linesBlockH + Math.round(lineFontSize * 0.28);
    ctx.strokeStyle = 'rgba(168, 40, 30, 0.2)';
    ctx.lineWidth = 0.5 * scale;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 40 * scale, dividerY);
    ctx.lineTo(W / 2 + 40 * scale, dividerY);
    ctx.stroke();

    const now = new Date();
    const fileDate = fmtDateFile(now);
    // 文件名 = 诗歌题目（无题目则「无题」）+ 日期；清理文件系统非法字符，超长截断
    const fileTitle =
      poemTitle
        .trim()
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, ' ')
        .slice(0, 50)
        .trim() || '无题';
    const fileBase = `${fileTitle}_${fileDate}`;
    const wordCount = completedLines.reduce((sum, l) => sum + l.length, 0);
    const sigText = `共 ${lines.length} 行 · ${wordCount} 字 · 创作于 ${fmtDateCN(now)}`;
    ctx.font = `italic ${sigFontSize}px ${serif}, serif`;
    ctx.fillStyle = 'rgba(58, 47, 34, 0.62)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sigText, W / 2, dividerY + Math.round(sigFontSize * 1.5));

    // JPEG 导出：照片纸背景压缩率高，自适应质量把文件控制在 1MB 内
    const toJpeg = (quality: number) =>
      new Promise<Blob | null>((resolve) => {
        try {
          canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
        } catch {
          resolve(null);
        }
      });
    try {
      let blob: Blob | null = null;
      for (const q of [0.85, 0.75, 0.65, 0.55]) {
        blob = await toJpeg(q);
        if (blob && blob.size <= 1024 * 1024) break;
      }
      if (blob) {
        const link = document.createElement('a');
        const objUrl = URL.createObjectURL(blob);
        link.download = `${fileBase}.jpg`;
        link.href = objUrl;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
        showToast('图片已保存');
      } else {
        // toBlob 失败兜底：PNG dataURL（体积可能较大）
        const link = document.createElement('a');
        link.download = `${fileBase}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('图片已保存');
      }
    } catch {
      showToast('下载失败 · 请重试');
    }
  }, [completedLines, poemTitle, showToast]);

  /* ---- 键盘快捷键（latest-ref 模式，注册一次） ---- */

  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});

  const handleKey = (e: KeyboardEvent) => {
    if (phase !== 'editor') return; // 开始界面禁用全部快捷键
    if (poemActive) {
      if (e.key === 'Escape') setPoemActive(false);
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const key = e.key.toLowerCase();
    if (key === 'r') {
      e.preventDefault();
      regen();
    } else if (key === 'l') {
      e.preventDefault();
      endLine();
    } else if (key === 'p') {
      e.preventDefault();
      endPoem();
    } else if (key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (currentLine.length > 0) {
        const lastWord = currentLine[currentLine.length - 1];
        setCurrentLine(currentLine.slice(0, -1));
        if (!lastWord.isFreeText) addWordBackToPool(lastWord);
      }
    }
  };

  useEffect(() => {
    keyHandlerRef.current = handleKey;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /* ---- 派生数据 ---- */

  const signatureText = `共 ${completedLines.length} 行 · ${completedLines.reduce((s, l) => s + l.length, 0)} 字 · 创作于 ${dateStr}`;

  const lineWords = useCallback((line: WordItem[]) => line.map((w) => w.word).join(''), []);

  /* ---- 横格纸分页布局：估算每句占用行数，写满 19 行即换新的一页 ---- */
  const sheetLayout = useMemo<FlowItem[][]>(() => {
    const sheets: FlowItem[][] = [[]];
    if (sheetW < 40) return sheets;
    let used = 0;
    const push = (item: FlowItem, rows: number) => {
      if (used > 0 && used + rows > SHEET.slots) {
        sheets.push([]);
        used = 0;
      }
      sheets[sheets.length - 1].push(item);
      used += rows;
    };
    completedLines.forEach((line, idx) => {
      const text = line.map((w) => w.word).join('');
      const rows = estDoneRows(text, sheetW);
      push({ kind: 'done', key: line.map((w) => w.uid).join('-'), idx, text, rows }, rows);
    });
    // 当前行常驻：即使为空也占一行，作为「点击自由书写」的落点
    const curRows = currentLine.length > 0 ? estCurRows(currentLine, sheetW) : 1;
    push({ kind: 'cur', rows: curRows }, curRows);
    return sheets;
  }, [completedLines, currentLine, sheetW, fontsTick]);

  /* ---- 渲染 ---- */

  return (
    <div className="game-shell">
      <div className="game-bg" aria-hidden="true" />
      <div className="game-noise" aria-hidden="true" />

      {phase === 'intro' && (
        <main className="intro-screen">
          <div className="intro-card">
            <div className="intro-brand">
              <h1>诗歌共创实验室</h1>
              <span className="intro-en">COLLAGE&nbsp;&nbsp;POEMS</span>
            </div>
            <p className="intro-sub">从散落的字词中，拾起一首诗</p>
            <div className="intro-rule" aria-hidden="true" />
            <div className="intro-q">
              <label className="intro-q-label" htmlFor="sceneInput">
                <span className="q-no" aria-hidden="true" />你想写的场景是？
              </label>
              <input
                id="sceneInput"
                ref={sceneRef}
                type="text"
                value={sceneInput}
                onChange={(e) => setSceneInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    moodRef.current?.focus();
                  }
                }}
                placeholder="例如：夏天的海边、下雨的黄昏、末班地铁…"
                maxLength={30}
                autoComplete="off"
                spellCheck={false}
                disabled={starting}
              />
            </div>
            <div className="intro-q">
              <label className="intro-q-label" htmlFor="moodInput">
                <span className="q-no" aria-hidden="true" />你的情绪是？
              </label>
              <input
                id="moodInput"
                ref={moodRef}
                type="text"
                value={moodInput}
                onChange={(e) => setMoodInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    startPoem();
                  }
                }}
                placeholder="例如：悠闲愉悦、莫名的忧伤、平静…"
                maxLength={30}
                autoComplete="off"
                spellCheck={false}
                disabled={starting}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary intro-start"
              onClick={startPoem}
              disabled={starting}
            >
              <span>
                {starting ? (
                  <span className="intro-loading">正在为你挑选词语…</span>
                ) : (
                  <>
                    <span className="icon">✦</span>开始写诗
                  </>
                )}
              </span>
            </button>
            <p className={`intro-hint${introHint ? ' show' : ''}`} role="status" aria-live="polite">
              {introHint}
            </p>
            {(completedLines.length > 0 || currentLine.length > 0) && (
              <p className="intro-resume">上次的诗笺还在，随时可以继续</p>
            )}
            <p className="intro-foot">两个答案，将为你生成灵感词汇</p>
          </div>
        </main>
      )}

      {phase === 'editor' && (
      <div className="app">
        <section className="notebook-wrapper">
          <header className="paper-header">
            <div className="brand">
              <h1>写下一首诗</h1>
              <span className="en">Collage Poems</span>
            </div>
            <div className="meta">
              <div className="date" id="dateStr">{dateStr}</div>
              <div className="edition">剪报诗笺 · 第〇〇一期</div>
              <div className="edition">从散落的字词中，拾起一首诗</div>
            </div>
          </header>

          <div className="section-label">
            创作区·写下诗句
            <span className="counter">
              已完成 <span id="lineCount">{completedLines.length}</span> 句 · 当前{' '}
              <span id="wordCount">{currentLine.length}</span> 字
            </span>
          </div>

          <div className="creation-area" ref={areaRef}>
            {sheetLayout.map((sheet, si) => {
              /* 纸张高度自适应：可见行数 = 已用行数+1（最少 4 行），
                 初始约整张纸的 1/4~1/3；写满 19 行展示整纸（含页脚）后另起新纸 */
              const usedRows = sheet.reduce((s, it) => s + it.rows, 0);
              const isFull = usedRows >= SHEET.slots;
              const visRows = Math.max(usedRows + 1, SHEET.minVisRows);
              return (
              <div className="poem-sheet" key={si} role="group" aria-label={`诗笺第 ${si + 1} 页`}>
                <div
                  className={`sheet-paper${isFull ? ' sheet-paper-full' : ''}`}
                  style={{ '--vis-rows': visRows } as CSSProperties}
                >
                <div className="sheet-flow">
                  {sheet.map((item) =>
                    item.kind === 'done' ? (
                      <div
                        key={item.key}
                        className={`sheet-line${removingLines.has(item.idx) ? ' removing' : ''}`}
                        style={{ '--rows': item.rows } as CSSProperties}
                      >
                        <span className="s-num" aria-hidden="true">{item.idx + 1}</span>
                        <span className="s-text">{item.text}</span>
                        <button
                          type="button"
                          className="s-clear"
                          title="清除该句"
                          aria-label={`清除第${item.idx + 1}句`}
                          onClick={() => removeLine(item.idx)}
                        >
                          ×
                        </button>
                        <button
                          type="button"
                          className="s-edit"
                          title="编辑该句"
                          aria-label={`编辑第${item.idx + 1}句`}
                          onClick={() => editLine(item.idx)}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            <path d="m15 5 4 4" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div
                        key="cur"
                        className="sheet-line sheet-line-current"
                        style={{ '--rows': item.rows } as CSSProperties}
                        title="点击空白处输入文字"
                        onClick={onCurLineClick}
                      >
                        {currentLine.length === 0 && caretIndex === null && (
                          <span className="s-placeholder">点击此处自由书写 · 或从词汇池拾取词语…</span>
                        )}
                        {currentLine.map((w, i) => (
                          <Fragment key={w.uid}>
                            {caretIndex === i && (
                              <input
                                ref={freeInputRef}
                                className="free-input"
                                value={draft}
                                style={{ width: `${Math.max(draftW + 6, 26)}px` }}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={onDraftKeyDown}
                                onBlur={() => commitDraft(false)}
                                aria-label="自由书写"
                                autoComplete="off"
                                autoCapitalize="off"
                                spellCheck={false}
                              />
                            )}
                            <span
                              className={`current-word${draggingUid === w.uid ? ' dragging' : ''}${isMobile && selectedUid === w.uid ? ' selected' : ''}`}
                              data-uid={w.uid}
                              data-word={w.word}
                              style={{ animationDelay: `${i * 0.04}s` }}
                              onMouseDown={onWordMouseDown}
                              onClick={
                                isMobile
                                  ? (e) => {
                                      e.stopPropagation();
                                      setSelectedUid((cur) => (cur === w.uid ? null : w.uid));
                                    }
                                  : undefined
                              }
                            >
                              {w.word}
                              {!isMobile && <span className="drag-tooltip" aria-hidden="true">长按拖动</span>}
                              {!isMobile && (
                                <button
                                  type="button"
                                  className="insert-caret"
                                  aria-label={`在「${w.word}」后输入文字`}
                                  title="在此处输入文字"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCaret(i + 1);
                                  }}
                                />
                              )}
                              {!isMobile && (
                                <button
                                  type="button"
                                  className="remove-icon"
                                  aria-label={`移除 ${w.word}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeWordFromLine(w.uid);
                                  }}
                                >
                                  ×
                                </button>
                              )}
                              {isMobile && selectedUid === w.uid && (
                                <span className="word-actions" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    className="word-act"
                                    aria-label={`左移「${w.word}」`}
                                    disabled={i === 0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveWord(w.uid, -1);
                                    }}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="m15 18-6-6 6-6" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="word-act"
                                    aria-label={`右移「${w.word}」`}
                                    disabled={i === currentLine.length - 1}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveWord(w.uid, 1);
                                    }}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="m9 18 6-6-6-6" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="word-act word-act-del"
                                    aria-label={`移除 ${w.word}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedUid(null);
                                      removeWordFromLine(w.uid);
                                    }}
                                  >
                                    ×
                                  </button>
                                </span>
                              )}
                            </span>
                          </Fragment>
                        ))}
                        {caretIndex !== null && caretIndex >= currentLine.length && (
                          <input
                            ref={freeInputRef}
                            className="free-input"
                            value={draft}
                            style={{ width: `${Math.max(draftW + 6, 26)}px` }}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={onDraftKeyDown}
                            onBlur={() => commitDraft(false)}
                            aria-label="自由书写"
                            autoComplete="off"
                            autoCapitalize="off"
                            spellCheck={false}
                          />
                        )}
                        {caretIndex !== null && (
                          <span
                            ref={measureRef}
                            className="free-input-measure"
                            aria-hidden="true"
                          >
                            {draft}
                          </span>
                        )}
                      </div>
                    ),
                  )}
                </div>
                </div>
              </div>
              );
            })}
          </div>
        </section>

        <section className="word-pool-area">
          <div className="pool-label">
            词汇池 · 点击拾取
            <span className="counter">
              共 <span id="poolCount">{poolWords.length}</span> 字
            </span>
          </div>
          <div className="word-pool" id="wordPool">
            {poolWords.map((w, i) => (
              <div
                key={w.uid}
                className={`word-card ${w.styleClass}${flyingUids.has(w.uid) ? ' flying-out' : ''}`}
                style={{
                  animationDelay: w.stagger ? `${i * 0.04}s` : '0s',
                  backgroundImage: `url("${w.bgUrl}")`,
                  backgroundSize: w.bgSize,
                  backgroundPosition: w.bgPos,
                }}
                role="button"
                tabIndex={0}
                aria-label={`拾取词汇 ${w.word}`}
                onClick={() => pickWord(w)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pickWord(w);
                  }
                }}
              >
                <span>{w.word}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="word-input-area">
          <div className="input-label">
            <span className="input-hint">词库未满？自行添入</span>
            <span className="vocab-stats">
              已学 <span className="count-num" id="vocabCount">{userVocab.length}</span> 字
              <button type="button" id="btnClearVocab" className="link-btn" onClick={clearUserVocab}>
                清空
              </button>
            </span>
          </div>
          <div className="input-wrapper">
            <input
              type="text"
              id="wordInput"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addUserWord();
                }
              }}
              placeholder="输入词汇，按回车收录…"
              maxLength={6}
              autoComplete="off"
              spellCheck={false}
              aria-label="输入新词汇"
            />
            <button type="button" id="btnAddWord" onClick={addUserWord}>
              收录
            </button>
          </div>
        </section>

        <section className="controls">
          <button type="button" className="btn" id="btnRegen" onClick={regen}>
            <span>
              <span className="icon">↻</span>词汇生成<span className="key">R</span>
            </span>
          </button>
          <button type="button" className="btn" id="btnEndLine" onClick={endLine}>
            <span>
              <span className="icon">↵</span>结束当前句<span className="key">L</span>
            </span>
          </button>
          <button type="button" className="btn btn-primary" id="btnEndPoem" onClick={endPoem}>
            <span>
              <span className="icon">✦</span>结束全诗<span className="key">P</span>
            </span>
          </button>
        </section>

        <footer className="page-foot">
          <button type="button" className="home-btn" onClick={goHome} title="回到开始界面">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
            </svg>
            返回首页
          </button>
        </footer>
      </div>
      )}

      <div
        className={`poem-display${poemActive ? ' active' : ''}`}
        ref={poemDisplayRef}
        aria-hidden={!poemActive}
      >
        <div className="poem-display-bg">
          <canvas id="bgCanvas" ref={bgCanvasRef} aria-hidden="true" />
        </div>
        <div className="poem-content" key={poemOpenCount}>
          {/* 诗作纸面：用户提供的折痕白纸原图，只为标题与诗作部分铺底 */}
          <div className="poem-paper">
            <div className="title-stamp-box">
              <input
                type="text"
                className="title-input"
                value={poemTitle}
                onChange={(e) => setPoemTitle(e.target.value)}
                placeholder="请在此输入标题"
                maxLength={24}
                autoComplete="off"
                spellCheck={false}
                aria-label="诗歌标题"
              />
            </div>
            <div className="poem-lines" id="finalPoem">
              {completedLines.map((line, i) => (
                <div key={i} className="poem-line" style={{ animationDelay: `${0.6 + i * 0.5}s` }}>
                  {lineWords(line)}
                </div>
              ))}
            </div>
          </div>
          <div
            className="signature"
            id="signature"
            style={{ animationDelay: `${0.6 + completedLines.length * 0.5 + 0.4}s` }}
          >
            {signatureText}
          </div>
          <div
            className="poem-actions"
            style={{ animationDelay: `${0.6 + completedLines.length * 0.5 + 0.8}s` }}
          >
            <button type="button" id="btnDownload" className="btn-download" onClick={downloadPoemImage}>
              下载图片
            </button>
            <button type="button" id="btnNewPoem" onClick={newPoem}>
              再作一首
            </button>
            <button type="button" id="btnCloseDisplay" onClick={closeDisplay}>
              返回编辑
            </button>
          </div>
          <div className="poem-foot">
            <button type="button" className="home-btn" onClick={goHomeFromPoem} title="回到开始界面">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
              </svg>
              返回首页
            </button>
          </div>
        </div>
      </div>

      <div className={`toast${toastVisible ? ' show' : ''}`} role="status" aria-live="polite">
        {toastText}
      </div>
    </div>
  );
}
