import { arrangeHeadTable, buildSlots, resolveHeadFacing, switchHeadTable } from './src/headSeating';
import { createEmptyPlan } from './src/utils';
import type { Guest, HeadRole, Plan, Table, Venue } from './src/types';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('❌', msg); }
  else console.log('✅', msg);
}

function g(partial: Partial<Guest> & { name: string }, role?: HeadRole): Guest {
  return { id: partial.name, name: partial.name, tags: [], partySize: 1, headRole: role, ...partial };
}

function guestsAt(t: Table[], plan: Plan) {
  return t.map((tb) => `${tb.label}: [${tb.seatOrder.map((id) => plan.guests.find((x) => x.id === id)?.name).join(', ')}]`).join(' ');
}

// ---------- 场景 ----------
const venue: Venue = { entranceSide: 'south', stageSide: 'north' };
const plan: Plan = { ...createEmptyPlan('测试'), venue };
plan.guests = [
  g({ name: '新郎' }, 'groom'),
  g({ name: '新娘' }, 'bride'),
  g({ name: '新郎父' }, 'groomFather'),
  g({ name: '新郎母' }, 'groomMother'),
  g({ name: '新娘父' }, 'brideFather'),
  g({ name: '新娘母' }, 'brideMother'),
  g({ name: '证婚人' }, 'officiant'),
  g({ name: '爷爷' }, 'elder'), // 祖辈
  g({ name: '大伯' }, 'elder'), // 父辈
  g({ name: '伴郎' }, 'bestMan'),
  g({ name: '伴娘' }, 'bridesmaid'),
  // 老人 + 小孩，要求近通道
  g({ name: '奶奶', easyAccess: true, generation: 0 }, 'elder'),
  g({ name: '小侄', easyAccess: true, childSeat: true, generation: 3, tags: ['儿童'] }, 'elder'),
  // 一个无身份普通人
  g({ name: '同事甲' }),
];
// 补辈分
(plan.guests.find((x) => x.name === '大伯') as Guest).generation = 1;
(plan.guests.find((x) => x.name === '爷爷') as Guest).generation = 0;
(plan.guests.find((x) => x.name === '证婚人') as Guest).generation = 1;

// 1) 朝向
assert(resolveHeadFacing(venue) === 'north', '有舞台时主位面向舞台(北)');
assert(resolveHeadFacing({ entranceSide: 'south', stageSide: null }) === 'north', '无舞台时背对进门(南门→面朝北)');
assert(resolveHeadFacing({ entranceSide: 'east', stageSide: null }) === 'west', '东门进场→面朝西');

// 2) 初次排主桌，容量 10，共 13 个主桌候选 → 溢出 3 人分副桌
let r = arrangeHeadTable({ plan, targetTable: null, capacity: 10 });
assert(r.overflow === 3, `坐不下溢出 3 人（实际 ${r.overflow}）`);
assert(!!r.secondaryTable, '自动生成副桌');
const headId = r.headTableId;
const head = r.tables.find((t) => t.id === headId)!;
const sec = r.secondaryTable!;
assert(sec.isSecondaryHead && sec.headGroupId === head.headGroupId, '副桌挂同一主桌组');
assert(head.isHeadTable, '主桌标记正确');
assert(head.seatOrder[0] === '新郎', `1 号主位是新郎（实际 ${head.seatOrder[0]}）`);
assert(head.seatOrder[1] === '新娘', `2 号位是新娘（实际 ${head.seatOrder[1]}）`);
const groomIdx = (n: string) => head.seatOrder.indexOf(n) + 1;
const parentSeats = ['新郎父', '新郎母', '新娘父', '新娘母'].map(groomIdx);
assert(parentSeats.every((s) => s >= 3 && s <= 6), `双方父母紧挨新人 3~6 号位（实际 ${parentSeats.join(',')}）`);
assert(head.seatOrder.filter(Boolean).length === 10, '主桌正好坐 10 人');
assert(sec.seatOrder.filter(Boolean).length === 3, `副桌坐溢出 3 人（实际 ${sec.seatOrder.filter(Boolean).length}）`);
assert(sec.seatOrder.slice(0, 7).every((id) => id === null), '副桌前 7 个主位侧号位留空，人从通道端排起');

// 同事甲无身份不应被拉进主桌
assert(![...head.seatOrder, ...sec.seatOrder].includes('同事甲'), '无身份普通宾客不会被拉进主桌');

// 3) 不丢人的全局校验：每人最多出现在一桌
const allSeats = r.tables.flatMap((t) => t.seatOrder).filter((id): id is string => !!id);
assert(new Set(allSeats).size === allSeats.length, '没有一人占两座');
// 所有有身份的人都在组内
const headGuests = new Set([...head.seatOrder, ...sec.seatOrder]);
for (const guest of plan.guests) {
  if (guest.headRole) assert(headGuests.has(guest.id), `主桌宾客 ${guest.name} 未丢失`);
}

// 4) 老人小孩近通道：组内 aisle 最大的座位应优先给 easyAccess 者或伴郎伴娘
const easyOrEntourage = (name: string) => {
  const gg = plan.guests.find((x) => x.name === name)!;
  return !!gg.easyAccess || gg.headRole === 'bestMan' || gg.headRole === 'bridesmaid';
};
for (const tb of [head, sec]) {
  const sl = buildSlots(tb.capacity);
  const aisleNames: string[] = [];
  tb.seatOrder.forEach((id, i) => { if (sl[i].aisle >= 1) aisleNames.push(id); });
  assert(
    aisleNames.length > 0 && aisleNames.every(easyOrEntourage),
    `${tb.label} 最靠通道的座位给老人/小孩/伴郎伴娘（实际：${aisleNames.join(',')}）`,
  );
}
assert(
  sec.seatOrder.some((id) => plan.guests.find((x) => x.id === id)?.easyAccess),
  '溢出的老人/小孩在副桌仍拿到近通道位',
);

// 5) 变动标记：初次所有人 prevSeatNo 为 null
assert(r.marks.every((m) => m.prevSeatNo === null), '初排标记：所有人来自宾客池');

// 6) 换大主桌容量重排（模拟在主桌手动改容量后点重排）→ 副桌的人回流，不丢
const plan2: Plan = { ...plan, tables: r.tables, seatMarks: r.marks };
const r2 = arrangeHeadTable({ plan: plan2, targetTable: plan2.tables.find((t) => t.id === headId)!, capacity: 14 });
const head2 = r2.tables.find((t) => t.id === headId)!;
assert(head2.seatOrder.filter(Boolean).length === 13, `扩容后 13 人全部回主桌（实际 ${head2.seatOrder.filter(Boolean).length}）`);
assert(r2.overflow === 0, '不再溢出');
// 新郎仍在 1 号
assert(head2.seatOrder[0] === '新郎', '重排后新郎仍居主位');
// 标记能看出挪动：至少有一条 prevSeatNo 与新 seatNo 不同
const movedMarks = r2.marks.filter((m) => m.prevSeatNo !== m.seatNo || m.prevTableId !== m.tableId);
assert(movedMarks.length > 0, `变动清单可看出谁被挪过（${movedMarks.length} 条）`);
const sample = movedMarks.find((m) => m.guestId === '证婚人' || m.guestId === '爷爷');
if (sample) console.log('   例:', sample.guestId, sample.prevTableId === headId ? `第${sample.prevSeatNo}位` : '副桌', `→ 第${sample.seatNo}位`);

// 7) 已经在普通桌坐好的人不跑丢：把同事甲放普通桌，重排主桌不应动他
const normal: Table = { id: 'normal1', label: '圆桌1', x: 0, y: 0, shape: 'round', capacity: 10, seatOrder: ['同事甲'] };
const plan3: Plan = { ...plan2, tables: [...r2.tables, normal] };
const r3 = arrangeHeadTable({ plan: plan3, targetTable: plan3.tables.find((t) => t.id === headId)!, capacity: 14 });
const normalAfter = r3.tables.find((t) => t.id === 'normal1')!;
assert(normalAfter.seatOrder.includes('同事甲'), '普通桌已坐好的人重排后不跑丢');

// 8) 有身份但已安排到别的桌的人不被强拉
const plan4: Plan = JSON.parse(JSON.stringify(plan3));
const other: Table = { id: 'other1', label: '亲戚桌', x: 0, y: 0, shape: 'round', capacity: 10, seatOrder: ['大伯'] };
plan4.tables = plan4.tables.map((t) => t.isHeadTable || t.isSecondaryHead ? { ...t, seatOrder: t.seatOrder.map((id) => (id === '大伯' ? null : id)) } : t);
plan4.tables.push(other);
const r4 = arrangeHeadTable({ plan: plan4, targetTable: plan4.tables.find((t) => t.id === headId)!, capacity: 14 });
assert(r4.tables.find((t) => t.id === 'other1')!.seatOrder.includes('大伯'), '已被安排到其他桌的长辈不被强行拉回主桌');
assert(!r4.tables.find((t) => t.id === headId)!.seatOrder.includes('大伯'), '大伯留在亲戚桌');

// 9) 换一张主桌：新建普通桌，把主桌换成它
const newHead: Table = { id: 'newh', label: '新主桌', x: 300, y: 300, shape: 'round', capacity: 14, seatOrder: [] };
const plan5: Plan = JSON.parse(JSON.stringify(plan3));
plan5.tables.push(newHead);
const r5 = switchHeadTable(plan5, 'newh', 14);
assert(r5.headTableId === 'newh', '换桌后主桌 id 更新');
const oldHeadAfter = r5.tables.find((t) => t.id === headId)!;
assert(!oldHeadAfter.isHeadTable && oldHeadAfter.seatOrder.every((id) => id === null), '旧主桌还原为普通空桌');
const newHeadAfter = r5.tables.find((t) => t.id === 'newh')!;
assert(newHeadAfter.seatOrder[0] === '新郎' && newHeadAfter.seatOrder[1] === '新娘', '换桌后新人在新主桌仍居主位，位次重排');
assert(newHeadAfter.headGroupId, '新主桌保留主桌组与朝向');
const switchMoved = r5.marks.filter((m) => m.prevTableId === headId && m.tableId === 'newh');
assert(switchMoved.length >= 10, `随桌迁移的人有「旧桌→新桌」移动记录（${switchMoved.length} 条）`);

// 10) 座位槽布局：10 人桌主位两侧展开
const s10 = buildSlots(10);
assert(s10[0].kind === 'groom' && s10[1].kind === 'bride', '10 人桌 1/2 号为新郎新娘');
assert(s10[2].side === 'bride' && s10[3].side === 'groom', '蛇形：3 号女家侧、4 号男家侧');
assert(s10[8].kind === 'brideEntourage' && s10[9].kind === 'groomEntourage', '末两号为伴郎伴娘靠通道位（9号男侧/10号女侧）');
assert(s10[9].aisle === 1, '末号位 aisle=1（最近通道）');
assert(s10[0].aisle === 0, '主位 aisle=0（最靠里）');

// 11) 男左女右：新郎方父母都在男家侧的槽、新娘方在女家侧槽
const rHead = r.tables.find((t) => t.id === headId)!;
const slots10 = buildSlots(10);
const seatSide = (name: string) => {
  const idx = rHead.seatOrder.indexOf(name);
  return slots10[idx]?.side;
};
assert(seatSide('新郎父') === 'groom' && seatSide('新郎母') === 'groom', '新郎父母排在男家一侧');
assert(seatSide('新娘父') === 'bride' && seatSide('新娘母') === 'bride', '新娘父母排在女家一侧');
assert(seatSide('伴郎') === 'groom' && seatSide('伴娘') === 'bride', '伴郎在男家侧、伴娘在女家侧');

// 12) 按辈分从主位向两边排：祖辈爷爷比父辈大伯更靠近主位
const rBig = arrangeHeadTable({
  plan: { ...plan, venue: { entranceSide: 'south', stageSide: 'south' } },
  targetTable: null,
  capacity: 14,
});
const bigHead = rBig.tables.find((t) => t.isHeadTable)!;
const seatNoOf = (name: string) => bigHead.seatOrder.indexOf(name) + 1;
assert(seatNoOf('爷爷') < seatNoOf('大伯'), `祖辈比父辈位次更靠主位（爷爷 ${seatNoOf('爷爷')} 号 < 大伯 ${seatNoOf('大伯')} 号）`);
assert(seatNoOf('大伯') < seatNoOf('小侄'), `父辈比晚辈位次更靠主位（大伯 ${seatNoOf('大伯')} 号 < 小侄 ${seatNoOf('小侄')} 号）`);

// 13) 标记细节：换桌后 reason 写明「换主桌」
assert(r5.marks.some((m) => m.reason.includes('换主桌')), '换主桌的变动原因可辨识');

// 14) 重建主桌：删除后新主桌能重新建立组关系
const plan6: Plan = JSON.parse(JSON.stringify(plan3));
plan6.tables = plan6.tables
  .filter((t) => t.id !== headId)
  .map((t) => (t.isSecondaryHead ? { ...t, isSecondaryHead: false, headGroupId: undefined } : t));
const r6 = arrangeHeadTable({ plan: plan6, targetTable: null, capacity: 10 });
assert(r6.tables.find((t) => t.isHeadTable), '删除旧主桌后可重新建立主桌');
assert(r6.headTableId !== headId, '新主桌 id 不同于被删除的桌');

console.log(failures === 0 ? '\n🎉 全部通过' : `\n💥 ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
