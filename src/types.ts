export type Guest = {
  id: string;
  name: string;
  tags: string[];
  partySize: number;
  childSeat?: boolean;
  note?: string;
  /** 主桌角色：父母 / 新人 / 证婚人 / 伴郎伴娘 / 长辈 */
  headRole?: HeadRole;
  /** 辈分（1=最高辈分 … 5=晚辈，留空时按角色推断），数字越小越靠近主位 */
  generation?: number;
  /** 自定年龄（岁），同辈分年长者优先 */
  age?: number;
};

/** 主桌位次上的角色 */
export type HeadRole =
  | 'officiant' // 证婚人/主婚人
  | 'groomParent' // 男方父母
  | 'brideParent' // 女方父母
  | 'elder' // 其他长辈
  | 'groom' // 新郎
  | 'bride' // 新娘
  | 'bestMan' // 伴郎
  | 'bridesmaid'; // 伴娘

export type TableShape = 'round' | 'rect';

export type Table = {
  id: string;
  label: string;
  x: number;
  y: number;
  shape: TableShape;
  capacity: number;
  seatOrder: string[]; // guest ids, length <= capacity；位次 0 即主位
  /** 是否为主桌组（主桌 + 主桌副桌） */
  isHead?: boolean;
  /** 主桌组序号：0=主桌，1=主桌二桌，依此类推 */
  headIndex?: number;
  /** 主位朝向微调（相对自动算出的主位角度，屏幕顺时针度数） */
  mainAngleOffset?: number;
  /** 已锁定位次的宾客 id（换主桌/重排时这些人不动） */
  lockedSeatGuests?: string[];
};

export type RuleType = 'together' | 'apart' | 'adjacent' | 'separate';

export type Rule = {
  id: string;
  type: RuleType;
  a: string; // guest id
  b: string; // guest id
};

/** 方位：屏幕视角，上北下南左西右东 */
export type Side = 'N' | 'S' | 'E' | 'W';

/** 主位朝向习俗 */
export type MainSeatConvention = 'facingDoor' | 'facingStage';

/** 宴会厅长幼朝向配置 */
export type VenueConfig = {
  /** 进门在哪一面 */
  doorSide: Side;
  /** 舞台在哪一面 */
  stageSide: Side;
  /** 主位朝向：面门（背舞台）或面舞台 */
  convention: MainSeatConvention;
  /** 男方亲属坐哪一侧：以主位上的人面向厅内的左右为准，默认左男右女 */
  groomSide: 'L' | 'R';
};

/** 位次被挪动的记录（最近一次自动编排产生） */
export type SeatMove = {
  guestId: string;
  fromTableId: string | null;
  fromSeat: number | null; // 1 起位次
  toTableId: string;
  toSeat: number;
  kind: 'moved' | 'kept' | 'added' | 'removed' | 'locked';
};

/** 最近一次自动编排（重排/换主桌/拆桌）的结果留痕 */
export type ArrangeReport = {
  reason: string;
  at: number;
  moves: SeatMove[];
  /** 本次编排后主桌组桌数 */
  headTableCount: number;
  /** 是否因坐不下而自动拆成了两桌 */
  split: boolean;
};

export type Plan = {
  id: string;
  name: string;
  tables: Table[];
  guests: Guest[];
  rules: Rule[];
  updatedAt: number;
  venue?: VenueConfig;
  report?: ArrangeReport | null;
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
  | { type: 'updateVenue'; venue: VenueConfig }
  | { type: 'arrangeHead'; tables: Table[]; report: ArrangeReport }
  | { type: 'setReport'; report: ArrangeReport | null }
  | { type: 'batch'; commands: Command[] };

export const TAG_OPTIONS = ['男方亲属', '女方亲属', '同事', '同学', '儿童', '老人', '素食'];
