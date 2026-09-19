import type {
  Guest,
  HeadRole,
  Plan,
  SeatMove,
  Side,
  Table,
  VenueConfig,
  ArrangeReport,
} from './types';

/* ------------------------------------------------------------------ */
/* 常量与默认值                                                        */
/* ------------------------------------------------------------------ */

export const HEAD_TABLE_SIZE = 268; // 画布上主桌（椭圆）外接盒尺寸
export const NORMAL_TABLE_SIZE = 160; // 普通圆桌外接盒
export const NORMAL_TABLE_RECT_W = 200;
export const NORMAL_TABLE_RECT_H = 120;

export const DEFAULT_VENUE: VenueConfig = {
  doorSide: 'S', // 默认进门在南（屏幕下方）
  stageSide: 'N', // 默认舞台在北（屏幕上方）
  convention: 'facingDoor', // 默认「主位面门」，即背向舞台
  groomSide: 'L', // 默认男左女右（以主位上的人面向厅内为准）
};

const SIDE_ANGLE: Record<Side, number> = { E: 0, S: 90, W: 180, N: 270 };

export const SIDE_LABELS: Record<Side, string> = { N: '北（上）', S: '南（下）', E: '东（右）', W: '西（左）' };

export function normalizeAngle(a: number): number {
  return ((a % 360) + 360) % 360;
}

export function normalizePlan(plan: Plan): Plan {
  if (!plan.venue) plan.venue = { ...DEFAULT_VENUE };
  for (const t of plan.tables) {
    if (t.isHead && t.headIndex === undefined) t.headIndex = 0;
    if (!t.lockedSeatGuests) t.lockedSeatGuests = [];
    // 老数据兼容：主桌 seatOrder 统一补齐为 capacity 长（空串=空位）
    if (t.isHead && t.seatOrder.length < t.capacity) {
      t.seatOrder = [...t.seatOrder, ...new Array(t.capacity - t.seatOrder.length).fill('')];
    }
  }
  return plan;
}

/* ------------------------------------------------------------------ */
/* 位次读写（主桌用与 capacity 等长的稀疏数组，空串表示空位）           */
/* ------------------------------------------------------------------ */

export function seatAt(t: Table, rank: number): string {
  return t.seatOrder[rank] || '';
}

export function seatCount(t: Table): number {
  return t.seatOrder.reduce((n, id) => n + (id ? 1 : 0), 0);
}

/* ------------------------------------------------------------------ */
/* 角色与辈分                                                          */
/* ------------------------------------------------------------------ */

export const HEAD_ROLE_LABELS: Record<HeadRole, string> = {
  officiant: '证婚人',
  groomParent: '男方父母',
  brideParent: '女方父母',
  elder: '长辈',
  groom: '新郎',
  bride: '新娘',
  bestMan: '伴郎',
  bridesmaid: '伴娘',
};

export const HEAD_ROLE_OPTIONS: { value: HeadRole; label: string }[] = [
  { value: 'officiant', label: '证婚人' },
  { value: 'groomParent', label: '男方父母' },
  { value: 'brideParent', label: '女方父母' },
  { value: 'elder', label: '长辈' },
  { value: 'groom', label: '新郎' },
  { value: 'bride', label: '新娘' },
  { value: 'bestMan', label: '伴郎' },
  { value: 'bridesmaid', label: '伴娘' },
];

/** 角色默认辈分（1=最高），数字越小越靠近主位 */
const ROLE_GENERATION: Record<HeadRole, number> = {
  officiant: 1,
  groomParent: 2,
  brideParent: 2,
  elder: 3,
  groom: 4,
  bride: 4,
  bestMan: 5,
  bridesmaid: 5,
};

/** 主位人选的优先顺序（同辈分下的再排序） */
const MAIN_SEAT_PRIORITY: HeadRole[] = [
  'officiant',
  'groomParent',
  'brideParent',
  'elder',
  'groom',
  'bride',
  'bestMan',
  'bridesmaid',
];

export function effectiveGeneration(g: Guest): number {
  if (g.generation !== undefined) return g.generation;
  return g.headRole ? ROLE_GENERATION[g.headRole] : 9;
}

/** 该宾客起身是否需要方便：老人标签、儿童、儿童椅、高龄长辈 */
export function needsEasyAccess(g: Guest): boolean {
  return g.tags.includes('老人') || g.tags.includes('儿童') || !!g.childSeat || (g.age !== undefined && g.age >= 65);
}

/** 角色暗示该人应坐哪一侧（以主位上的人面向厅内为准）；null=不限 */
export function familySideHint(g: Guest, venue: VenueConfig): 'L' | 'R' | null {
  const groom: 'L' | 'R' = venue.groomSide;
  const bride: 'L' | 'R' = groom === 'L' ? 'R' : 'L';
  switch (g.headRole) {
    case 'groomParent':
    case 'bestMan':
    case 'groom':
      return groom;
    case 'brideParent':
    case 'bridesmaid':
    case 'bride':
      return bride;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* 位次几何                                                            */
/* ------------------------------------------------------------------ */

/**
 * 主位角度（屏幕坐标系：右=0°，向下顺时针）。
 * 主位上的人面朝此方向（即主位座位摆在桌子靠此方向的边缘，面门或面舞台）。
 */
export function mainSeatAngle(t: Table, venue: VenueConfig): number {
  const baseSide = venue.convention === 'facingDoor' ? venue.doorSide : venue.stageSide;
  return normalizeAngle(SIDE_ANGLE[baseSide] + (t.mainAngleOffset || 0));
}

/**
 * 位次序号（0=主位，顺时针数）→ 从主位开始顺时针的步数。
 * 交错规则：主位之后右一、左一、右二、左二…… 偶数桌的最后一位为副主位（主位正对面）。
 */
export function rankToCwOffset(rank: number, capacity: number): number {
  if (rank === 0) return 0;
  if (capacity % 2 === 0 && rank === capacity - 1) return capacity / 2; // 副主位
  if (rank % 2 === 1) return (rank + 1) / 2; // 右 k
  return capacity - rank / 2; // 左 k
}

export type SlotKind = 'main' | 'right' | 'left' | 'deputy';

export function slotKind(rank: number, capacity: number): SlotKind {
  if (rank === 0) return 'main';
  if (capacity % 2 === 0 && rank === capacity - 1) return 'deputy';
  return rank % 2 === 1 ? 'right' : 'left';
}

/** 位次序号 → 该座位在屏幕上的角度 */
export function slotAngle(rank: number, t: Table, venue: VenueConfig): number {
  return normalizeAngle(mainSeatAngle(t, venue) + rankToCwOffset(rank, t.capacity) * (360 / t.capacity));
}

/** 位次属于主位的左/右哪一侧（以主位上的人面向厅内为准） */
export function slotSide(rank: number, capacity: number): 'L' | 'R' | null {
  const kind = slotKind(rank, capacity);
  if (kind === 'right') return 'R';
  if (kind === 'left') return 'L';
  return null;
}

/** 该位次离进门通道的远近：数字越小越靠通道（0=正对门） */
export function slotAisleDistance(rank: number, t: Table, venue: VenueConfig): number {
  const a =
    ((slotAngle(rank, t, venue) - SIDE_ANGLE[venue.doorSide] + 540) % 360) - 180;
  return Math.abs(a);
}

/** 主位左/右标签的屏幕坐标百分比（主桌椭圆边缘） */
export function sideLabelPos(side: 'L' | 'R', t: Table, venue: VenueConfig): { leftPct: number; topPct: number } {
  const main = (mainSeatAngle(t, venue) * Math.PI) / 180;
  const sign = side === 'R' ? 1 : -1; // 面向厅内时，右手 = 屏幕顺时针 +90°
  const ang = main + (sign * Math.PI) / 2;
  return { leftPct: 50 + Math.cos(ang) * 42, topPct: 50 + Math.sin(ang) * 42 };
}

/* ------------------------------------------------------------------ */
/* 自动编排                                                            */
/* ------------------------------------------------------------------ */

export type ArrangeHeadResult = {
  tables: Table[]; // 编排后的全部桌次（含新拆出的副桌）
  report: ArrangeReport;
  split: boolean;
};

type ArrangeOptions = {
  venue: VenueConfig;
  guests: Guest[];
  tables: Table[];
  primaryTableId: string; // 主桌桌 id（换主桌时为新主桌）
  reason: string;
  generateId?: () => string;
};

/** 主桌组里的宾客 id 集合 */
export function headGroupGuestIds(tables: Table[]): Set<string> {
  const ids = new Set<string>();
  for (const t of tables) {
    if (!t.isHead) continue;
    for (const id of t.seatOrder) if (id) ids.add(id);
  }
  return ids;
}

export function getPrimaryHeadTable(tables: Table[]): Table | undefined {
  const head = tables.filter((t) => t.isHead);
  return head.find((t) => t.headIndex === 0) || head[0];
}

export function getHeadTables(tables: Table[]): Table[] {
  return tables
    .filter((t) => t.isHead)
    .sort((a, b) => (a.headIndex || 0) - (b.headIndex || 0));
}

/** 主桌组总容量是否坐不下（需要/已经拆桌时，false 表示现有副桌够用） */
export function headOverflow(tables: Table[]): boolean {
  const head = tables.filter((t) => t.isHead);
  if (head.length === 0) return false;
  const totalCap = head.reduce((sum, t) => sum + t.capacity, 0);
  return headGroupGuestIds(tables).size > totalCap;
}

function compareGuests(a: Guest, b: Guest): number {
  // 辈分 → 主位角色优先序 → 年龄（长者先）→ 姓名，保证结果稳定可复现
  const ga = effectiveGeneration(a);
  const gb = effectiveGeneration(b);
  if (ga !== gb) return ga - gb;
  const pa = a.headRole ? MAIN_SEAT_PRIORITY.indexOf(a.headRole) : 99;
  const pb = b.headRole ? MAIN_SEAT_PRIORITY.indexOf(b.headRole) : 99;
  if (pa !== pb) return pa - pb;
  if ((a.age || 0) !== (b.age || 0)) return (b.age || 0) - (a.age || 0);
  return a.name.localeCompare(b.name, 'zh-CN');
}

let autoIdCounter = 0;
function nextId(): string {
  autoIdCounter += 1;
  return `head-extra-${Date.now()}-${autoIdCounter}`;
}

const EXTRA_LABELS = ['二', '三', '四', '五', '六', '七', '八'];

/**
 * 主桌自动编排：
 * 1. 主位 = 按进门/舞台算出的一边（默认面门背舞台，可切「面舞台」）；
 * 2. 已入座主桌组的人按辈分从主位向右一、左一、右二、左二交错排开；
 * 3. 男方/女方依「男左女右」分侧，伴郎伴娘随新郎新娘；
 * 4. 老人/小孩在同辈分内优先离通道近、起身方便的位次；
 * 5. 锁定（图钉）的人钉在原位不动；
 * 6. 一桌坐不下自动拆出「主桌二桌」，主位与朝向保持一致。
 * 换一张主桌调用本函数：旧主桌组的人全部带到新主桌重排，任何人不会丢失。
 */
export function arrangeHeadTables(opts: ArrangeOptions): ArrangeHeadResult {
  const { venue, guests, tables, primaryTableId, reason } = opts;
  const genId = opts.generateId || nextId;
  const guestById = new Map(guests.map((g) => [g.id, g]));

  const oldHeadTables = tables.filter((t) => t.isHead);
  const primary = tables.find((t) => t.id === primaryTableId) || oldHeadTables[0];
  if (!primary) throw new Error('arrangeHeadTables: 主桌不存在');

  // 「换主桌」时：旧主桌组的人全部带到新主桌组；新主桌原有的宾客也保留
  const memberIds = headGroupGuestIds(oldHeadTables);
  for (const id of primary.seatOrder) if (id) memberIds.add(id);

  const members = [...memberIds]
    .map((id) => guestById.get(id))
    .filter((g): g is Guest => !!g);

  // 锁定的人（图钉）：重排时钉在原位
  const lockedIds = new Set<string>();
  for (const t of oldHeadTables) {
    for (const id of t.lockedSeatGuests || []) if (memberIds.has(id)) lockedIds.add(id);
  }

  const cap = primary.capacity;
  const needTables = Math.max(1, Math.ceil(members.length / cap));
  const split = needTables > 1;

  // 目标主桌组：主桌 + 沿用旧副桌 + 不足则新建（保持主位与朝向一致）
  const oldExtras = oldHeadTables
    .filter((t) => t.id !== primary.id)
    .sort((a, b) => (a.headIndex || 0) - (b.headIndex || 0));
  const targets: Table[] = [];
  for (let i = 0; i < needTables; i++) {
    if (i === 0) {
      targets.push({ ...primary, isHead: true, headIndex: 0, seatOrder: new Array(cap).fill('') });
    } else if (oldExtras[i - 1]) {
      const t = oldExtras[i - 1];
      targets.push({
        ...t,
        isHead: true,
        headIndex: i,
        capacity: cap,
        mainAngleOffset: primary.mainAngleOffset || 0,
        seatOrder: new Array(cap).fill(''),
      });
    } else {
      const last = targets[i - 1];
      targets.push({
        id: genId(),
        label: `主桌${EXTRA_LABELS[i - 1] || i + 1}桌`,
        x: last.x + HEAD_TABLE_SIZE + 48,
        y: last.y,
        shape: 'round',
        capacity: cap,
        seatOrder: new Array(cap).fill(''),
        isHead: true,
        headIndex: i,
        mainAngleOffset: primary.mainAngleOffset || 0,
        lockedSeatGuests: [],
      });
    }
  }
  const targetIds = new Set(targets.map((t) => t.id));

  // 旧位置快照，用于「谁被挪过、挪到第几位」留痕
  const before = new Map<string, { tableId: string; seat: number }>();
  for (const t of tables) {
    t.seatOrder.forEach((id, idx) => {
      if (id) before.set(id, { tableId: t.id, seat: idx });
    });
  }

  // 1) 先钉锁定的人（位次越界时退化为普通成员，避免被丢）
  const freeMembers: Guest[] = [];
  for (const g of members) {
    const loc = before.get(g.id);
    if (lockedIds.has(g.id) && loc && targetIds.has(loc.tableId) && loc.seat < cap) {
      const target = targets.find((t) => t.id === loc.tableId);
      if (target && !target.seatOrder[loc.seat]) {
        target.seatOrder[loc.seat] = g.id;
        continue;
      }
    }
    freeMembers.push(g);
  }
  freeMembers.sort(compareGuests);

  // 2) 逐桌、逐位次填人；各队列跨桌持续消费（第一桌剩什么，第二桌接着排）
  const leftQ = freeMembers.filter((g) => familySideHint(g, venue) === 'L').sort(compareGuests);
  const rightQ = freeMembers.filter((g) => familySideHint(g, venue) === 'R').sort(compareGuests);
  const neutralQ = freeMembers.filter((g) => familySideHint(g, venue) === null).sort(compareGuests);
  const allQ = [...freeMembers].sort(compareGuests); // 主位/副主位/兜底
  const removeId = (id: string) => {
    for (const q of [leftQ, rightQ, neutralQ, allQ]) {
      const i = q.findIndex((g) => g.id === id);
      if (i >= 0) q.splice(i, 1);
    }
  };

  for (const t of targets) {
    for (let rank = 0; rank < cap; rank++) {
      if (t.seatOrder[rank]) continue;
      const kind = slotKind(rank, cap);
      const side = slotSide(rank, cap);
      let g: Guest | null = null;

      if (kind === 'main') {
        // 主位：剩余者中辈分最高者（证婚人 → 父母 → 长辈……）
        g = allQ.shift() || null;
      } else if (kind === 'deputy') {
        // 副主位：主位之外辈分最高者
        g = allQ.shift() || null;
      } else if (side === 'R' || side === 'L') {
        // 该侧首选队列与「未分侧」队列的队首比辈分，高者得位；
        // 保证右一/左一这一对总体仍按辈分向外排，同时尊重男左女右。
        const preferred = side === 'R' ? rightQ : leftQ;
        const other = side === 'R' ? leftQ : rightQ;
        const p = preferred[0];
        const n = neutralQ[0];
        if (p && (!n || compareGuests(p, n) <= 0)) g = preferred.shift()!;
        else if (n && (!p || compareGuests(n, p) <= 0)) g = neutralQ.shift()!;
        else g = other.shift() || null; // 本侧及未分侧都空了，对侧补位
      } else {
        g = allQ.shift() || null;
      }
      if (g) {
        t.seatOrder[rank] = g.id;
        removeId(g.id);
      }
    }
    // 3) 老人/小孩在同辈分内就近通道微调
    optimizeAisle(t, venue, guestById);
  }

  // 组装最终桌表：旧主桌桌若不在新主桌组里，降级为普通桌（人不丢，随桌保留）
  const resultTables: Table[] = tables.map((t) => {
    const nt = targets.find((x) => x.id === t.id);
    if (nt) return nt;
    if (t.isHead && !targetIds.has(t.id)) {
      return { ...t, isHead: false, headIndex: undefined, lockedSeatGuests: [] };
    }
    return t;
  });
  for (const nt of targets) {
    if (!resultTables.some((t) => t.id === nt.id)) resultTables.push(nt);
  }

  // 3) 留痕
  const after = new Map<string, { tableId: string; seat: number }>();
  for (const t of resultTables) {
    t.seatOrder.forEach((id, idx) => {
      if (id) after.set(id, { tableId: t.id, seat: idx });
    });
  }
  const moves: SeatMove[] = [];
  for (const g of members) {
    const a = before.get(g.id);
    const b = after.get(g.id);
    if (!b) continue;
    let kind: SeatMove['kind'];
    if (lockedIds.has(g.id)) kind = 'locked';
    else if (!a) kind = 'added';
    else if (a.tableId === b.tableId && a.seat === b.seat) kind = 'kept';
    else kind = 'moved';
    moves.push({
      guestId: g.id,
      fromTableId: a?.tableId || null,
      fromSeat: a ? a.seat + 1 : null,
      toTableId: b.tableId,
      toSeat: b.seat + 1,
      kind,
    });
  }
  moves.sort((a, b) => a.toTableId.localeCompare(b.toTableId) || a.toSeat - b.toSeat);

  return {
    tables: resultTables,
    split,
    report: { reason, at: Date.now(), moves, headTableCount: targets.length, split },
  };
}

/**
 * 就近通道优化：同辈分的两人，若交换后老人/小孩离通道更近，
 * 且不破坏主位、副主位与男左女右分侧，则交换。
 */
function optimizeAisle(t: Table, venue: VenueConfig, guestById: Map<string, Guest>) {
  const dist = (rank: number) => slotAisleDistance(rank, t, venue);
  for (let pass = 0; pass < 4; pass++) {
    let swapped = false;
    for (let i = 0; i < t.capacity; i++) {
      for (let j = i + 1; j < t.capacity; j++) {
        const a = t.seatOrder[i] ? guestById.get(t.seatOrder[i]) : null;
        const b = t.seatOrder[j] ? guestById.get(t.seatOrder[j]) : null;
        if (!a || !b) continue;
        if (slotKind(i, t.capacity) === 'main' || slotKind(j, t.capacity) === 'main') continue;
        if (slotKind(i, t.capacity) === 'deputy' || slotKind(j, t.capacity) === 'deputy') continue;
        if (effectiveGeneration(a) !== effectiveGeneration(b)) continue; // 不动长幼
        const si = slotSide(i, t.capacity);
        const sj = slotSide(j, t.capacity);
        const ha = familySideHint(a, venue);
        const hb = familySideHint(b, venue);
        if (ha && si && ha !== si) continue;
        if (hb && sj && hb !== sj) continue;
        if (ha && hb && ha !== hb && si !== sj) continue;
        const beforeD = (needsEasyAccess(a) ? dist(i) : 0) + (needsEasyAccess(b) ? dist(j) : 0);
        const afterD = (needsEasyAccess(a) ? dist(j) : 0) + (needsEasyAccess(b) ? dist(i) : 0);
        if (afterD < beforeD) {
          t.seatOrder[i] = b.id;
          t.seatOrder[j] = a.id;
          swapped = true;
        }
      }
    }
    if (!swapped) break;
  }
}
