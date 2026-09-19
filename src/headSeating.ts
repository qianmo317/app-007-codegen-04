import type {
  FamilySide,
  Facing,
  Guest,
  HeadRole,
  Plan,
  SeatMark,
  Table,
  Venue,
} from './types';
import { generateId } from './utils';

/**
 * 主桌位次编排核心算法
 *
 * 规矩（中式婚宴常见做法，均可在 UI 上调整）：
 * 1. 主位方向：有舞台时新人面向舞台；无舞台时背对进门方向。
 * 2. seatOrder[0] = 1 号主位，沿桌边「左尊右卑」向两侧蛇形展开：
 *      1 号主位 → 2 号（男家侧）→ 3 号（女家侧）→ 4 号（男家侧）……
 *    位次数字越大离主位越远，最末两号正对主位、靠近进门通道。
 * 3. 新人坐 1、2 号；双方父母 3、4、5 号；证婚人居尊位；
 *    其余长辈按辈分（祖辈→父辈→平辈→晚辈）从主位向两边排开。
 * 4. 伴郎伴娘坐在主位对面的末号位（靠通道一侧），方便起身帮忙。
 * 5. 老人、小孩、行动不便者（easyAccess）尽量换到离通道近的末段座位。
 */

/** 座位的角色槽位：决定该位置放哪类人 */
type SlotKind =
  | 'groom'
  | 'bride'
  | 'groomParent'
  | 'brideParent'
  | 'officiant'
  | 'elder'
  | 'groomEntourage'
  | 'brideEntourage';

type Slot = {
  kind: SlotKind;
  /** 男左女右：该槽属于哪一侧（新人两侧的主位槽为 null） */
  side: FamilySide | null;
  /** 离主位的展开层级（0=主位，越大越靠外） */
  rank: number;
  /** 与通道的接近程度：0=靠主位（里），1=靠外侧/通道 */
  aisle: number;
};

export type ArrangeOptions = {
  capacity: number;
  targetTable: Table | null;
  plan: Plan;
};

export type ArrangeResult = {
  tables: Table[];
  marks: SeatMark[];
  headTableId: string;
  secondaryTable: Table | null;
  overflow: number;
};

const ROLE_KIND: Record<HeadRole, SlotKind> = {
  groom: 'groom',
  bride: 'bride',
  groomFather: 'groomParent',
  groomMother: 'groomParent',
  brideFather: 'brideParent',
  brideMother: 'brideParent',
  officiant: 'officiant',
  elder: 'elder',
  bestMan: 'groomEntourage',
  bridesmaid: 'brideEntourage',
};

const ROLE_PRIORITY: Record<HeadRole, number> = {
  groom: 0,
  bride: 0,
  groomFather: 1,
  groomMother: 1,
  brideFather: 1,
  brideMother: 1,
  officiant: 2,
  elder: 3,
  bestMan: 9,
  bridesmaid: 9,
};

export function kindOf(g: Guest): SlotKind | null {
  return g.headRole ? ROLE_KIND[g.headRole] : null;
}

export function sideOf(g: Guest): FamilySide | null {
  if (g.familySide) return g.familySide;
  const k = kindOf(g);
  if (k === 'groom' || k === 'groomParent' || k === 'groomEntourage') return 'groom';
  if (k === 'bride' || k === 'brideParent' || k === 'brideEntourage') return 'bride';
  return null;
}

function genOf(g: Guest): number {
  if (typeof g.generation === 'number') return g.generation;
  const k = kindOf(g);
  if (k === 'groomParent' || k === 'brideParent' || k === 'officiant') return 1;
  if (k === 'groomEntourage' || k === 'brideEntourage') return 2;
  return 2;
}

/**
 * 生成座位槽位，数组下标 = seatOrder 位次（0 即 1 号主位）。
 * 蛇形展开：奇数号在男家侧、偶数号（≥2）在女家侧。
 */
export function buildSlots(capacity: number): Slot[] {
  const slots: Slot[] = [];
  const maxDist = Math.ceil((capacity - 1) / 2);
  for (let i = 0; i < capacity; i++) {
    const dist = i === 0 ? 0 : Math.ceil(i / 2);
    // 正对主位的末段座位（靠进门通道）
    const isFarEnd = capacity >= 8 && i >= capacity - 2;

    let kind: SlotKind;
    if (i === 0) kind = 'groom';
    else if (i === 1) kind = 'bride';
    else if (isFarEnd) kind = i % 2 === 1 ? 'groomEntourage' : 'brideEntourage';
    else if (i <= 5) kind = i % 2 === 1 ? 'groomParent' : 'brideParent';
    else if (i <= 7) kind = 'officiant';
    else kind = 'elder';

    const side: FamilySide | null =
      i <= 1 ? null : i % 2 === 1 ? 'groom' : 'bride';
    const rank = kind === 'groom' || kind === 'bride' ? 0 : kind === 'groomEntourage' || kind === 'brideEntourage' ? 9 : dist;

    slots.push({ kind, side, rank, aisle: maxDist > 0 ? dist / maxDist : 0 });
  }
  return slots;
}

/** 候选宾客按优先级排序：新人 → 父母 → 证婚人 → 长辈按辈分 → 伴郎伴娘，姓名兜底稳定 */
export function sortCandidates(guests: Guest[]): Guest[] {
  return [...guests].sort((a, b) => {
    const ra = a.headRole ? ROLE_PRIORITY[a.headRole] : 5;
    const rb = b.headRole ? ROLE_PRIORITY[b.headRole] : 5;
    if (ra !== rb) return ra - rb;
    const ga = genOf(a);
    const gb = genOf(b);
    if (ga !== gb) return ga - gb;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

/** 宾客放进某个槽位的匹配分；侧别不符重罚，老人小孩额外偏好近通道位 */
function matchScore(guest: Guest, slot: Slot): number {
  const kind = kindOf(guest);
  let score = 0;
  if (kind === slot.kind) score += 100;

  const gSide = sideOf(guest);
  if (gSide && slot.side) {
    score += gSide === slot.side ? 40 : -80;
  }

  // 角色槽不够用时的兜底：同类长辈位按辈分/贴近主位给分
  if (slot.kind === 'elder') {
    if (kind === 'elder') score += 30 - genOf(guest) * 4 - slot.rank;
    if (kind === 'groomParent' || kind === 'brideParent') score += 34 - slot.rank;
    if (kind === 'officiant') score += slot.rank <= 3 ? 30 : 8;
    if (kind === 'groomEntourage' || kind === 'brideEntourage') score += 12 + slot.aisle * 30;
    if (!kind) score += 5;
  }
  // 证婚人/长辈槽富余时互相兜底，长辈仍按辈分贴近主位
  if (slot.kind === 'officiant') {
    if (kind === 'elder') score += 26 - genOf(guest) * 4 - slot.rank;
    if (kind === 'groomParent' || kind === 'brideParent') score += 24 - slot.rank;
    if (!kind) score += 4;
  }
  // 长辈也可以坐末段近通道位（尤其老人小孩）
  if ((slot.kind === 'groomEntourage' || slot.kind === 'brideEntourage') &&
      (kind === 'elder' || !kind)) {
    score += slot.aisle * (guest.easyAccess ? 45 : 12);
  }
  if (guest.easyAccess) score += slot.aisle * 25;
  return score;
}

/**
 * 按座位槽位结构挑选主桌人选：
 * 新人、双方父母、证婚人、伴郎伴娘先占各自的专属槽，
 * 剩余座位按辈分从高到低安排长辈；排不下的进副桌。
 */
function selectPrimaryGuests(candidates: Guest[], slots: Slot[]): { primary: Guest[]; extra: Guest[] } {
  const ordered = sortCandidates(candidates);
  const slotCount = (k: SlotKind) => slots.filter((s) => s.kind === k).length;
  const chosen: Guest[] = [];
  const used = new Set<string>();
  const take = (kind: SlotKind, pred: (g: Guest) => boolean) => {
    const n = slotCount(kind);
    const people = ordered.filter((g) => !used.has(g.id) && pred(g)).slice(0, n);
    for (const g of people) { used.add(g.id); chosen.push(g); }
  };

  take('groom', (g) => kindOf(g) === 'groom');
  take('bride', (g) => kindOf(g) === 'bride');
  take('groomParent', (g) => kindOf(g) === 'groomParent');
  take('brideParent', (g) => kindOf(g) === 'brideParent');
  take('officiant', (g) => kindOf(g) === 'officiant');
  take('groomEntourage', (g) => kindOf(g) === 'groomEntourage');
  take('brideEntourage', (g) => kindOf(g) === 'brideEntourage');

  // 剩余座位按辈分/优先级给其他人（长辈优先，无身份者兜底）
  for (const g of ordered) {
    if (chosen.length >= slots.length) break;
    if (!used.has(g.id)) { used.add(g.id); chosen.push(g); }
  }
  const extra = ordered.filter((g) => !used.has(g.id));
  return { primary: chosen, extra };
}

/**
 * 把候选宾客排进 capacity 个座位。
 * fillFrom='head'（默认，主桌满员用）：固定角色槽归位，空位从主位向通道排；
 * fillFrom='aisle'（副桌人少时用）：整体从通道端起排，保证老人小孩坐在通道侧、
 * 空座位留在靠主位的里侧。
 */
function assignSeats(candidates: Guest[], capacity: number, fillFrom: 'head' | 'aisle' = 'head'): (Guest | null)[] {
  const slots = buildSlots(capacity);
  const result: (Guest | null)[] = new Array(capacity).fill(null);
  const pool = sortCandidates(candidates);
  const used = new Set<string>();

  // 副桌人少：从通道端起排（伴郎伴娘/老人小孩占通道侧，空位留在主位里侧）
  if (fillFrom === 'aisle') {
    const order = [...slots.keys()].sort((a, b) => slots[b].aisle - slots[a].aisle || slots[a].rank - slots[b].rank);
    // 先按通道侧匹配分高的人，再补其余
    const people = [...pool];
    const place = (pred: (g: Guest) => boolean, slotKinds: SlotKind[]) => {
      for (const si of order) {
        if (result[si] !== null || !slotKinds.includes(slots[si].kind)) continue;
        let bi = -1;
        let best = -Infinity;
        people.forEach((g, k) => {
          if (used.has(g.id) || !pred(g)) return;
          const sc = matchScore(g, slots[si]);
          if (sc > best) { best = sc; bi = k; }
        });
        if (bi >= 0) { result[si] = people[bi]; used.add(people[bi].id); }
      }
    };
    place((g) => kindOf(g) === 'groomEntourage', ['groomEntourage', 'brideEntourage']);
    place((g) => kindOf(g) === 'brideEntourage', ['brideEntourage', 'groomEntourage']);
    place(() => true, slots.map((s) => s.kind));
    return result;
  }

  // 1) 固定角色槽
  const fixedKinds: SlotKind[] = [
    'groom', 'bride', 'groomParent', 'brideParent', 'officiant', 'groomEntourage', 'brideEntourage',
  ];
  for (const kind of fixedKinds) {
    const people = pool.filter((g) => !used.has(g.id) && kindOf(g) === kind);
    const seatIdxs = slots
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => s.kind === kind && result[i] === null)
      .sort((a, b) => a.s.rank - b.s.rank);
    people.forEach((g, pi) => {
      const seat = seatIdxs[pi];
      if (seat) {
        result[seat.i] = g;
        used.add(g.id);
      }
    });
  }

  // 2) 空位从主位侧依次填（空座留在最外段）；谁坐哪个位由匹配分决定，
  //    老人小孩的近通道偏好通过 matchScore 与下面的 2-opt 交换向外调整
  const rest = pool.filter((g) => !used.has(g.id));
  const freeSlots = result
    .map((_v, i) => i)
    .filter((i) => result[i] === null)
    .sort((a, b) => slots[a].rank - slots[b].rank || slots[a].aisle - slots[b].aisle);
  const remaining = [...rest];
  for (const si of freeSlots) {
    if (remaining.length === 0) break;
    let best = 0;
    for (let k = 1; k < remaining.length; k++) {
      if (matchScore(remaining[k], slots[si]) > matchScore(remaining[best], slots[si])) best = k;
    }
    result[si] = remaining[best];
    remaining.splice(best, 1);
  }

  // 3) 2-opt 交换：只接受总分变高（辈分归位、老人小孩归通道侧）
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let i = 0; i < capacity; i++) {
      for (let j = i + 1; j < capacity; j++) {
        const a = result[i];
        const b = result[j];
        if (!a || !b) continue;
        const before = matchScore(a, slots[i]) + matchScore(b, slots[j]);
        const after = matchScore(a, slots[j]) + matchScore(b, slots[i]);
        if (after > before + 1) {
          result[i] = b;
          result[j] = a;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  return result;
}

/** 计算主位朝向：面向舞台；无舞台则背对进门方向 */
export function resolveHeadFacing(venue: Venue | undefined): Facing {
  if (venue?.stageSide) return venue.stageSide;
  const entrance = venue?.entranceSide ?? 'south';
  const opposite: Record<Facing, Facing> = { north: 'south', south: 'north', east: 'west', west: 'east' };
  return opposite[entrance];
}

export function facingLabel(f: Facing): string {
  return { north: '北', south: '南', east: '东', west: '西' }[f];
}

/**
 * 收集应坐主桌组的人：
 * - 已坐在主桌/副桌的人一律保留（「已经排好的人不要跑丢」）；
 * - 有主桌身份、但还没坐到其他普通桌的人自动入组；
 * - 有身份却已被安排到别的桌的人不强行拉回。
 */
export function collectHeadGuests(plan: Plan, groupIds: Set<string>): Guest[] {
  const seatedAt = new Map<string, string>();
  for (const t of plan.tables) t.seatOrder.forEach((gid) => { if (gid) seatedAt.set(gid, t.id); });

  const result: Guest[] = [];
  const seen = new Set<string>();
  const push = (g: Guest | undefined) => {
    if (g && !seen.has(g.id)) {
      seen.add(g.id);
      result.push(g);
    }
  };

  for (const t of plan.tables) {
    if (!groupIds.has(t.id)) continue;
    for (const gid of t.seatOrder) if (gid) push(plan.guests.find((g) => g.id === gid));
  }
  for (const g of plan.guests) {
    if (!g.headRole) continue;
    const at = seatedAt.get(g.id);
    if (!at || groupIds.has(at)) push(g);
  }
  return result;
}

function buildMarks(
  before: Map<string, { tableId: string; seatNo: number }>,
  assigned: (Guest | null)[],
  table: Table,
  reason: string,
): SeatMark[] {
  const now = Date.now();
  const marks: SeatMark[] = [];
  assigned.forEach((g, i) => {
    if (!g) return;
    const prev = before.get(g.id) ?? null;
    marks.push({
      guestId: g.id,
      tableId: table.id,
      seatNo: i + 1,
      prevSeatNo: prev?.seatNo ?? null,
      prevTableId: prev?.tableId ?? null,
      reason,
      changedAt: now,
    });
  });
  return marks;
}

/**
 * 主桌自动编排（坐不下自动分两桌）。
 * 主桌取优先级最高的 capacity 人；其余进副桌，副桌同组、同朝向。
 */
export function arrangeHeadTable(opts: ArrangeOptions): ArrangeResult {
  const { plan, targetTable, capacity } = opts;
  const headGroupId =
    targetTable?.headGroupId ??
    plan.tables.find((t) => t.isHeadTable)?.headGroupId ??
    generateId();

  const groupIds = new Set<string>();
  groupIds.add(targetTable?.id ?? '__new__');
  for (const t of plan.tables) if (t.headGroupId === headGroupId) groupIds.add(t.id);

  const candidates = collectHeadGuests(plan, groupIds);

  const before = new Map<string, { tableId: string; seatNo: number }>();
  for (const t of plan.tables) {
    t.seatOrder.forEach((gid, i) => { if (gid) before.set(gid, { tableId: t.id, seatNo: i + 1 }); });
  }

  const overflow = Math.max(0, candidates.length - capacity);

  const primary: Table = targetTable
    ? { ...targetTable, capacity, isHeadTable: true, isSecondaryHead: false, headGroupId }
    : {
        id: generateId(),
        label: '主桌',
        x: 60,
        y: 60,
        shape: 'round',
        capacity,
        seatOrder: [],
        isHeadTable: true,
        isSecondaryHead: false,
        headGroupId,
      };

  const { primary: primaryGuests, extra: extraGuests } = selectPrimaryGuests(candidates, buildSlots(capacity));

  const assigned = assignSeats(primaryGuests, capacity);
  // 主桌按设计应满员；若人数不足保留 null 空位（稀疏位次）
  primary.seatOrder = assigned.map((gg) => gg?.id ?? null);

  let secondaryTable: Table | null =
    plan.tables.find((t) => t.headGroupId === headGroupId && t.isSecondaryHead) ?? null;

  const marks = buildMarks(before, assigned, primary, targetTable ? '主桌重排' : '主桌初排');

  if (extraGuests.length > 0) {
    const secCapacity = Math.max(10, extraGuests.length + 2);
    if (!secondaryTable) {
      secondaryTable = {
        id: generateId(),
        label: '主桌·副桌',
        x: primary.x + 300,
        y: primary.y,
        shape: primary.shape,
        capacity: secCapacity,
        seatOrder: [],
        isHeadTable: false,
        isSecondaryHead: true,
        headGroupId,
      };
    } else {
      secondaryTable = { ...secondaryTable, capacity: Math.max(secondaryTable.capacity, secCapacity) };
    }
    const secAssigned = assignSeats(extraGuests, secondaryTable.capacity, 'aisle');
    secondaryTable.seatOrder = secAssigned.map((gg) => gg?.id ?? null);
    marks.push(...buildMarks(before, secAssigned, secondaryTable, '主桌坐不下，分至副桌（主位朝向不变）'));
  } else if (secondaryTable) {
    // 不再溢出：副桌人员回主桌后清空，保留 null 空号位维持位次结构
    secondaryTable = { ...secondaryTable, seatOrder: new Array(secondaryTable.capacity).fill(null) };
  }

  // 组装结果：新人等入组宾客从其他桌撤下，其余桌保持原样
  const busyGuests = new Set<string>(
    [...primary.seatOrder, ...(secondaryTable?.seatOrder ?? [])].filter((id): id is string => !!id),
  );
  const tables: Table[] = [];
  for (const t of plan.tables) {
    if (t.id === primary.id) continue;
    if (secondaryTable && t.id === secondaryTable.id) continue;
    tables.push({ ...t, seatOrder: t.seatOrder.map((gid) => (gid && busyGuests.has(gid) ? null : gid)) });
  }
  tables.push(primary);
  if (secondaryTable) tables.push(secondaryTable);

  return { tables, marks, headTableId: primary.id, secondaryTable, overflow };
}

/**
 * 换一张主桌：原主桌组所有人迁到新桌，按新位置重排；
 * 旧桌还原为普通空桌，副桌仍挂同一主桌组（保住主位与朝向）。
 */
export function switchHeadTable(plan: Plan, newHeadId: string, capacity: number): ArrangeResult {
  const target = plan.tables.find((t) => t.id === newHeadId);
  if (!target) throw new Error('target table not found');
  const result = arrangeHeadTable({ plan, targetTable: { ...target, capacity }, capacity });

  const oldHead = plan.tables.find((t) => t.isHeadTable && t.id !== newHeadId);
  if (oldHead) {
    const idx = result.tables.findIndex((t) => t.id === oldHead.id);
    if (idx >= 0) {
      result.tables[idx] = {
        ...result.tables[idx],
        isHeadTable: false,
        isSecondaryHead: false,
        headGroupId: undefined,
      };
    }
  }
  // 迁移原因体现在 marks 上
  for (const m of result.marks) {
    if (m.tableId === result.headTableId && m.prevTableId && m.prevTableId !== result.headTableId) {
      m.reason = '换主桌：随新主位重排';
    }
  }
  return result;
}

export function isHeadGroup(t: Table): boolean {
  return !!t.isHeadTable || !!t.isSecondaryHead;
}

/** 给 UI 用的位次说明：该号位相对主位的角色与是否近通道 */
export function describeSeat(slotIndex: number, capacity: number, facing: Facing): string {
  const slot = buildSlots(capacity)[slotIndex];
  if (!slot) return '';
  const kindText: Record<SlotKind, string> = {
    groom: '新郎主位',
    bride: '新娘位',
    groomParent: '男家尊长位',
    brideParent: '女家尊长位',
    officiant: '证婚人位',
    elder: '长辈位',
    groomEntourage: '伴郎位（靠通道）',
    brideEntourage: '伴娘位（靠通道）',
  };
  const sideText = slot.side === 'groom' ? '男家一侧' : slot.side === 'bride' ? '女家一侧' : '';
  return `${kindText[slot.kind]}${sideText ? ` · ${sideText}` : ''} · 面向${facingLabel(facing)}${slot.aisle > 0.7 ? ' · 近通道' : ''}`;
}
