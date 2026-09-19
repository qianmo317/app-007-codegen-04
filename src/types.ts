export type Guest = {
  id: string;
  name: string;
  tags: string[];
  partySize: number;
  childSeat?: boolean;
  note?: string;
  /** 主桌身份（新人 / 父母 / 证婚人 / 长辈 / 伴郎伴娘…） */
  headRole?: HeadRole;
  /** 辈分：0=祖辈 1=父辈 2=平辈 3=晚辈，数字越小辈分越高 */
  generation?: number;
  /** 男家 / 女家，决定从主位展开时排在左（男）还是右（女） */
  familySide?: FamilySide;
  /** 老人 / 小孩 / 行动不便，尽量排在近通道、起身方便的位置 */
  easyAccess?: boolean;
};

export type TableShape = 'round' | 'rect';

export type Table = {
  id: string;
  label: string;
  x: number;
  y: number;
  shape: TableShape;
  capacity: number;
  /** guest ids；null 表示该号位留空（副桌从通道端起排时，主位侧保留空号） */
  seatOrder: (string | null)[];
  /** 主桌组：主桌坐不下拆两桌时，副桌与主桌共享同一个 groupId */
  isHeadTable?: boolean;
  /** 副桌标记（主桌的另一半）；主位朝向仍按场地朝向保留 */
  isSecondaryHead?: boolean;
  headGroupId?: string;
};

export type RuleType = 'together' | 'apart' | 'adjacent' | 'separate';

export type Rule = {
  id: string;
  type: RuleType;
  a: string; // guest id
  b: string; // guest id
};

/** 朝向：屏幕方位（画布上北下南左西右东） */
export type Facing = 'north' | 'south' | 'east' | 'west';

export type Venue = {
  /** 进门在宴会厅的哪一边 */
  entranceSide?: Facing;
  /** 舞台在宴会厅的哪一边；无舞台设为 null */
  stageSide: Facing | null;
};

export type FamilySide = 'groom' | 'bride';

export type HeadRole =
  | 'groom' // 新郎
  | 'bride' // 新娘
  | 'groomFather'
  | 'groomMother'
  | 'brideFather'
  | 'brideMother'
  | 'officiant' // 证婚人/主婚人
  | 'elder' // 其余长辈
  | 'bestMan' // 伴郎
  | 'bridesmaid'; // 伴娘

/** 重排后每个人的变动记录：「谁被挪过、挪到了第几位」 */
export type SeatMark = {
  guestId: string;
  tableId: string;
  /** 重排后的位次（1 起） */
  seatNo: number;
  /** 重排前的位次（1 起）；null 表示刚从别处/宾客池调入主桌 */
  prevSeatNo: number | null;
  prevTableId: string | null;
  reason: string;
  changedAt: number;
};

export type Plan = {
  id: string;
  name: string;
  tables: Table[];
  guests: Guest[];
  rules: Rule[];
  updatedAt: number;
  venue?: Venue;
  /** 最新一次主桌重排的变动记录 */
  seatMarks?: SeatMark[];
};

export type Command =
  | { type: 'updatePlan'; plan: Plan }
  | { type: 'updateTables'; tables: Table[] }
  | { type: 'updateGuests'; guests: Guest[] }
  | { type: 'updateRules'; rules: Rule[] }
  | { type: 'updateTable'; table: Table }
  | { type: 'addGuest'; guest: Guest }
  | { type: 'removeGuest'; guestId: string }
  | { type: 'addTable'; table: Table }
  | { type: 'removeTable'; tableId: string }
  | { type: 'moveGuest'; guestId: string; fromTableId: string | null; toTableId: string | null; toIndex?: number }
  /** 主桌自动重排（含可能的拆两桌），一次原子操作，可整体撤销 */
  | { type: 'arrangeHeadTable'; tables: Table[]; marks: SeatMark[]; headTableId: string }
  /** 换主桌：旧桌取消主位标记、宾客整体迁移到新桌后重排 */
  | { type: 'switchHeadTable'; tables: Table[]; marks: SeatMark[]; headTableId: string }
  /** 更新场地（进门 / 舞台）设置 */
  | { type: 'updateVenue'; venue: Venue }
  /** 清除位次变动标记 */
  | { type: 'clearSeatMarks' }
  | { type: 'batch'; commands: Command[] };

export const TAG_OPTIONS = ['男方亲属', '女方亲属', '同事', '同学', '儿童', '素食'];

export const HEAD_ROLE_OPTIONS: { value: HeadRole; label: string; side: FamilySide | null }[] = [
  { value: 'groom', label: '新郎', side: 'groom' },
  { value: 'bride', label: '新娘', side: 'bride' },
  { value: 'groomFather', label: '新郎父亲', side: 'groom' },
  { value: 'groomMother', label: '新郎母亲', side: 'groom' },
  { value: 'brideFather', label: '新娘父亲', side: 'bride' },
  { value: 'brideMother', label: '新娘母亲', side: 'bride' },
  { value: 'officiant', label: '证婚人/主婚人', side: null },
  { value: 'elder', label: '其他长辈', side: null },
  { value: 'bestMan', label: '伴郎', side: 'groom' },
  { value: 'bridesmaid', label: '伴娘', side: 'bride' },
];

export const GENERATION_OPTIONS = [
  { value: 0, label: '祖辈' },
  { value: 1, label: '父辈' },
  { value: 2, label: '平辈' },
  { value: 3, label: '晚辈' },
];
