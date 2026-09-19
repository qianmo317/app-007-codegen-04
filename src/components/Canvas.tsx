import { useState, useRef, useEffect } from 'react';
import type { Plan, Table, Command, Side, VenueConfig, SeatMove } from '../types';
import { generateId } from '../utils';
import {
  arrangeHeadTables,
  getPrimaryHeadTable,
  HEAD_TABLE_SIZE,
  NORMAL_TABLE_SIZE,
  NORMAL_TABLE_RECT_W,
  NORMAL_TABLE_RECT_H,
  SIDE_LABELS,
  seatAt,
  seatCount,
  slotAngle,
  slotKind,
  sideLabelPos,
  mainSeatAngle,
} from '../headTable';

interface Props {
  plan: Plan;
  dragGuestId: string | null;
  setDragGuestId: (id: string | null) => void;
  conflictMap: Map<string, string[]>;
  dispatch: (cmd: Command) => void;
}

const VENUE_W = 1200;
const VENUE_H = 900;

export default function Canvas({ plan, dragGuestId, setDragGuestId, conflictMap, dispatch }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggingTable, setDraggingTable] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [showTableMenu, setShowTableMenu] = useState<{ x: number; y: number } | null>(null);
  const [showVenue, setShowVenue] = useState(false);
  const venue = plan.venue!;
  const primary = getPrimaryHeadTable(plan.tables);

  const tableBox = (t: Table) => {
    if (t.isHead) return { w: HEAD_TABLE_SIZE, h: HEAD_TABLE_SIZE };
    return {
      w: t.shape === 'round' ? NORMAL_TABLE_SIZE : NORMAL_TABLE_RECT_W,
      h: t.shape === 'round' ? NORMAL_TABLE_SIZE : NORMAL_TABLE_RECT_H,
    };
  };

  const handleDropOnCanvas = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragGuestId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + canvasRef.current.scrollLeft;
    const y = e.clientY - rect.top + canvasRef.current.scrollTop;
    const table = plan.tables.find((t) => {
      const box = tableBox(t);
      return x >= t.x && x <= t.x + box.w && y >= t.y && y <= t.y + box.h;
    });
    if (table) {
      const fromTable = plan.tables.find((t) => t.seatOrder.includes(dragGuestId));
      if (fromTable?.id === table.id) return;
      if (seatCount(table) >= table.capacity) {
        alert('该桌已满');
        return;
      }
      // 主桌落到第一个空位次（中间允许空位）；普通桌直接末尾
      const toIndex = table.isHead
        ? table.seatOrder.findIndex((id) => !id)
        : undefined;
      dispatch({
        type: 'moveGuest',
        guestId: dragGuestId,
        fromTableId: fromTable?.id || null,
        toTableId: table.id,
        toIndex: toIndex !== undefined && toIndex >= 0 ? toIndex : undefined,
      });
    }
    setDragGuestId(null);
  };

  const handleTableMouseDown = (e: React.MouseEvent, table: Table) => {
    if ((e.target as HTMLElement).closest('.table-seats, .head-actions, .head-side-labels')) return;
    setDraggingTable(table.id);
    setSelectedTableId(table.id);
    setDragOffset({ x: e.clientX - table.x, y: e.clientY - table.y });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingTable) return;
      const x = e.clientX - dragOffset.x;
      const y = e.clientY - dragOffset.y;
      dispatch({
        type: 'updateTable',
        table: { ...plan.tables.find((t) => t.id === draggingTable)!, x: Math.max(0, x), y: Math.max(0, y) },
      });
    };
    const onUp = () => setDraggingTable(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [draggingTable, dragOffset, plan.tables, dispatch]);

  const addTable = (shape: 'round' | 'rect') => {
    const id = generateId();
    const count = plan.tables.filter((t) => t.shape === shape && !t.isHead).length + 1;
    const table: Table = {
      id,
      label: `${shape === 'round' ? '圆' : '长'}桌${count}`,
      x: 60 + (plan.tables.length % 4) * 200,
      y: 120 + Math.floor(plan.tables.length / 4) * 180,
      shape,
      capacity: 10,
      seatOrder: [],
    };
    dispatch({ type: 'addTable', table });
  };

  const addHeadTable = () => {
    if (primary) {
      alert('已经有主桌了。需要换桌时，请选中新桌后点「设为主桌」。');
      return;
    }
    const id = generateId();
    const table: Table = {
      id,
      label: '主桌',
      x: Math.max(60, VENUE_W / 2 - HEAD_TABLE_SIZE / 2),
      y: venue.doorSide === 'S' ? 420 : venue.doorSide === 'N' ? 260 : 320,
      shape: 'round',
      capacity: 10,
      seatOrder: new Array(10).fill(''),
      isHead: true,
      headIndex: 0,
      lockedSeatGuests: [],
    };
    dispatch({ type: 'addTable', table });
    setSelectedTableId(id);
  };

  const removeTable = (tableId: string) => {
    if (!confirm('确定删除该桌？')) return;
    dispatch({ type: 'removeTable', tableId });
    setSelectedTableId(null);
  };

  /** 主桌组现有桌位是否够用：不够就要再拆一桌并提醒 */
  const needMoreTable = () => {
    const head = plan.tables.filter((t) => t.isHead);
    if (head.length === 0) return false;
    const members = head.flatMap((t) => t.seatOrder).filter(Boolean).length;
    const cap = head.reduce((s, t) => s + t.capacity, 0);
    return members > cap;
  };

  /** 重排主桌组 */
  const rerunHead = (reason: string) => {
    if (!primary) return;
    if (needMoreTable()) {
      if (!confirm('主桌一桌坐不下，将自动再拆出一桌（主位与朝向保持不变），继续吗？')) return;
    }
    const result = arrangeHeadTables({
      venue,
      guests: plan.guests,
      tables: plan.tables,
      primaryTableId: primary.id,
      reason,
      generateId,
    });
    dispatch({ type: 'arrangeHead', tables: result.tables, report: result.report });
    if (result.split) {
      setTimeout(() => alert(`一桌坐不下，已自动分成 ${result.report.headTableCount} 桌：主位与朝向保持不变，多出的人按辈分排入「主桌二桌」。`), 50);
    }
  };

  /** 把某张桌设为主桌：按新位置重排两侧，已排好的人全部保留 */
  const setAsHead = (table: Table) => {
    const oldPrimary = primary;
    const memberCount = (() => {
      const ids = new Set<string>();
      if (oldPrimary) {
        for (const t of plan.tables) if (t.isHead) for (const id of t.seatOrder) if (id) ids.add(id);
      }
      for (const id of table.seatOrder) if (id) ids.add(id);
      return ids.size;
    })();
    if (memberCount > table.capacity) {
      if (!confirm(`主桌组共 ${memberCount} 人，一桌坐不下，将自动分出「主桌二桌」并保住主位与朝向，继续吗？`)) return;
    }
    const prepared: Table[] = plan.tables.map((t) => {
      if (t.id === table.id) {
        return {
          ...t,
          isHead: true,
          headIndex: 0,
          shape: 'round',
          seatOrder: t.isHead ? t.seatOrder : new Array(t.capacity).fill('').map((_, i) => t.seatOrder[i] || ''),
          lockedSeatGuests: t.lockedSeatGuests || [],
        };
      }
      return t;
    });
    const result = arrangeHeadTables({
      venue,
      guests: plan.guests,
      tables: prepared,
      primaryTableId: table.id,
      reason: `已将「${table.label}」设为主桌，按新位置重排两侧座次`,
      generateId,
    });
    dispatch({ type: 'arrangeHead', tables: result.tables, report: result.report });
    if (result.split) {
      setTimeout(() => alert(`一桌坐不下，已自动分成 ${result.report.headTableCount} 桌：主位与朝向保持不变。`), 50);
    }
  };

  /** 取消主桌：主桌组全部降为普通桌，人不丢 */
  const cancelHead = () => {
    if (!confirm('取消主桌标记？宾客会保留在原桌上，位次标记（主位等）将不再显示。')) return;
    const tables = plan.tables.map((t) =>
      t.isHead ? { ...t, isHead: false, headIndex: undefined, lockedSeatGuests: [] } : t,
    );
    dispatch({ type: 'batch', commands: [{ type: 'updateTables', tables }, { type: 'setReport', report: null }] });
  };

  const nudgeMain = (table: Table, delta: number) => {
    dispatch({
      type: 'updateTable',
      table: { ...table, mainAngleOffset: ((table.mainAngleOffset || 0) + delta + 360) % 360 },
    });
  };

  const toggleLock = (table: Table, guestId: string) => {
    const set = new Set(table.lockedSeatGuests || []);
    if (set.has(guestId)) set.delete(guestId);
    else set.add(guestId);
    dispatch({ type: 'updateTable', table: { ...table, lockedSeatGuests: [...set] } });
  };

  /** 拖到主桌某个位次；目标位有人时两人互换 */
  const handleHeadSeatDrop = (table: Table, rank: number) => {
    if (!dragGuestId) return;
    const targetId = seatAt(table, rank);
    if (targetId && targetId !== dragGuestId) {
      // 先快照所有人的原位置，再按快照交换，避免连锁覆盖
      const locs = new Map<string, { tableId: string; rank: number }>();
      for (const t of plan.tables) t.seatOrder.forEach((id, i) => { if (id) locs.set(id, { tableId: t.id, rank: i }); });
      const dragLoc = locs.get(dragGuestId);
      const targetLoc = locs.get(targetId)!;
      if (!dragLoc) {
        dispatch({ type: 'moveGuest', guestId: dragGuestId, fromTableId: null, toTableId: table.id, toIndex: rank });
        setDragGuestId(null);
        return;
      }
      const tables = plan.tables.map((t) => {
        let order = [...t.seatOrder];
        if (t.id === dragLoc.tableId) order[dragLoc.rank] = targetLoc.tableId === t.id ? targetId : '';
        if (t.id === targetLoc.tableId) order[targetLoc.rank] = dragGuestId;
        // 普通桌不允许中间空位（主桌才按荣誉位次保留空洞）
        if (!t.isHead) order = order.filter(Boolean);
        return { ...t, seatOrder: order };
      });
      dispatch({ type: 'updateTables', tables });
      setDragGuestId(null);
      return;
    }
    const fromTable = plan.tables.find((t) => t.seatOrder.includes(dragGuestId));
    dispatch({
      type: 'moveGuest',
      guestId: dragGuestId,
      fromTableId: fromTable?.id || null,
      toTableId: table.id,
      toIndex: rank,
    });
    setDragGuestId(null);
  };

  const handleSeatDrop = (tableId: string, index: number) => {
    if (!dragGuestId) return;
    const toTable = plan.tables.find((t) => t.id === tableId)!;
    const fromTable = plan.tables.find((t) => t.seatOrder.includes(dragGuestId));
    if (toTable.isHead) {
      handleHeadSeatDrop(toTable, index);
      return;
    }
    if (toTable.seatOrder.includes(dragGuestId)) {
      dispatch({ type: 'moveGuest', guestId: dragGuestId, fromTableId: tableId, toTableId: tableId, toIndex: index });
    } else {
      if (toTable.seatOrder.length >= toTable.capacity) {
        alert('该桌已满');
        return;
      }
      dispatch({ type: 'moveGuest', guestId: dragGuestId, fromTableId: fromTable?.id || null, toTableId: tableId, toIndex: index });
    }
    setDragGuestId(null);
  };

  const updateVenue = (next: VenueConfig, prev: VenueConfig) => {
    if (primary && next.groomSide !== prev.groomSide) {
      // 男左女右翻转 → 两侧座次重排，但已排好的人不丢
      const result = arrangeHeadTables({
        venue: next,
        guests: plan.guests,
        tables: plan.tables,
        primaryTableId: primary.id,
        reason: '调整了男方/女方就坐侧，按新侧别重排座次',
        generateId,
      });
      dispatch({
        type: 'batch',
        commands: [
          { type: 'updateVenue', venue: next },
          { type: 'arrangeHead', tables: result.tables, report: result.report },
        ],
      });
    } else {
      dispatch({ type: 'updateVenue', venue: next });
    }
  };

  const moveMap = new Map<string, SeatMove>();
  for (const m of plan.report?.moves || []) moveMap.set(m.guestId, m);

  return (
    <div className="canvas-panel">
      <div className="canvas-toolbar">
        <button onClick={() => addTable('round')}>+ 圆桌</button>
        <button onClick={() => addTable('rect')}>+ 长条桌</button>
        <button className="head-add-btn" onClick={addHeadTable}>★ 主桌</button>
        <button className="venue-btn" onClick={() => setShowVenue((s) => !s)}>朝向 / 舞台 / 进门</button>
        {primary && (
          <button className="rerun-btn" onClick={() => rerunHead('手动触发：按辈分从主位重排两侧座次')}>
            重排主桌
          </button>
        )}
        {primary && (
          <span className="head-status">
            主桌：{primary.label} · 主位{venue.convention === 'facingDoor' ? '面门（背舞台）' : '面舞台'} ·{' '}
            {venue.groomSide === 'L' ? '男左女右' : '男右女左'}
          </span>
        )}
      </div>

      {showVenue && (
        <VenuePanel venue={venue} onChange={(v) => { updateVenue(v, venue); }} onClose={() => setShowVenue(false)} />
      )}

      <div
        className="canvas-area"
        ref={canvasRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropOnCanvas}
        onContextMenu={(e) => { e.preventDefault(); setShowTableMenu({ x: e.clientX, y: e.clientY }); }}
        onClick={() => { setSelectedTableId(null); setShowTableMenu(null); }}
      >
        <div className="venue-area" style={{ width: VENUE_W, height: VENUE_H }}>
          <VenueAnchors venue={venue} />

          {plan.tables.map((table) =>
            table.isHead ? (
              <HeadTableView
                key={table.id}
                table={table}
                plan={plan}
                venue={venue}
                selected={selectedTableId === table.id}
                conflictMap={conflictMap}
                moveMap={moveMap}
                onMouseDown={(e) => handleTableMouseDown(e, table)}
                onSelect={() => setSelectedTableId(table.id)}
                onSeatDrop={handleSeatDrop}
                onToggleLock={(gid) => toggleLock(table, gid)}
                onNudge={(d) => nudgeMain(table, d)}
                onRerun={() => rerunHead('手动触发：按辈分从主位重排两侧座次')}
                onSetAsHead={() => setAsHead(table)}
                onCancelHead={cancelHead}
                onRemove={() => removeTable(table.id)}
                dispatch={dispatch}
              />
            ) : (
              <NormalTableView
                key={table.id}
                table={table}
                plan={plan}
                selected={selectedTableId === table.id}
                conflictMap={conflictMap}
                onMouseDown={(e) => handleTableMouseDown(e, table)}
                onSeatDrop={handleSeatDrop}
                onSetAsHead={() => setAsHead(table)}
                onRemove={() => removeTable(table.id)}
                dispatch={dispatch}
              />
            ),
          )}
        </div>
      </div>

      {plan.report && <ArrangeReportPanel plan={plan} onClose={() => dispatch({ type: 'setReport', report: null })} />}

      {showTableMenu && (
        <div className="context-menu" style={{ left: showTableMenu.x, top: showTableMenu.y }}>
          <div onClick={() => { addTable('round'); setShowTableMenu(null); }}>添加圆桌</div>
          <div onClick={() => { addTable('rect'); setShowTableMenu(null); }}>添加长条桌</div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 场地朝向面板                                                        */
/* ------------------------------------------------------------------ */

function VenuePanel({ venue, onChange, onClose }: { venue: VenueConfig; onChange: (v: VenueConfig) => void; onClose: () => void }) {
  const sides: Side[] = ['N', 'E', 'S', 'W'];
  return (
    <div className="venue-panel" onClick={(e) => e.stopPropagation()}>
      <div className="venue-panel-title">
        宴会厅朝向
        <button className="venue-close" onClick={onClose}>×</button>
      </div>
      <label>
        进门朝向
        <select value={venue.doorSide} onChange={(e) => onChange({ ...venue, doorSide: e.target.value as Side })}>
          {sides.map((s) => <option key={s} value={s}>{SIDE_LABELS[s]}</option>)}
        </select>
      </label>
      <label>
        舞台位置
        <select value={venue.stageSide} onChange={(e) => onChange({ ...venue, stageSide: e.target.value as Side })}>
          {sides.map((s) => <option key={s} value={s}>{SIDE_LABELS[s]}</option>)}
        </select>
      </label>
      <label>
        主位朝向
        <select value={venue.convention} onChange={(e) => onChange({ ...venue, convention: e.target.value as VenueConfig['convention'] })}>
          <option value="facingDoor">面门（背舞台，常见讲究）</option>
          <option value="facingStage">面舞台（一进大门正对主桌时）</option>
        </select>
      </label>
      <label>
        男/女方就坐侧
        <select value={venue.groomSide} onChange={(e) => onChange({ ...venue, groomSide: e.target.value as 'L' | 'R' })}>
          <option value="L">男左女右（以主位面向厅内为准）</option>
          <option value="R">男右女左</option>
        </select>
      </label>
      <p className="venue-hint">
        主位在「进门与舞台」确定的一边，长辈从主位向右一、左一交错排开。
        改动进门/舞台只转主位方向；改动男女侧会自动重排（已排好的人不丢）。
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 场地标记（舞台、大门、通道）                                        */
/* ------------------------------------------------------------------ */

function VenueAnchors({ venue }: { venue: VenueConfig }) {
  const stageClass = `stage-anchor side-${venue.stageSide}`;
  const doorClass = `door-anchor side-${venue.doorSide}`;
  return (
    <>
      <div className={stageClass}>舞台 STAGE</div>
      <div className={doorClass}>大门</div>
      <div className="aisline" data-side={venue.doorSide} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 主桌                                                               */
/* ------------------------------------------------------------------ */

interface HeadViewProps {
  table: Table;
  plan: Plan;
  venue: VenueConfig;
  selected: boolean;
  conflictMap: Map<string, string[]>;
  moveMap: Map<string, SeatMove>;
  onMouseDown: (e: React.MouseEvent) => void;
  onSelect: () => void;
  onSeatDrop: (tableId: string, rank: number) => void;
  onToggleLock: (guestId: string) => void;
  onNudge: (delta: number) => void;
  onRerun: () => void;
  onSetAsHead: () => void;
  onCancelHead: () => void;
  onRemove: () => void;
  dispatch: (cmd: Command) => void;
}

function HeadTableView(props: HeadViewProps) {
  const { table, plan, venue, selected, conflictMap, moveMap } = props;
  const isFull = seatCount(table) >= table.capacity;
  const mainAngle = mainSeatAngle(table, venue);
  const groomPos = sideLabelPos(venue.groomSide, table, venue);
  const bridePos = sideLabelPos(venue.groomSide === 'L' ? 'R' : 'L', table, venue);
  const guestById = new Map(plan.guests.map((g) => [g.id, g]));

  return (
    <div
      className={`head-table-item ${selected ? 'selected' : ''} ${isFull ? 'full' : ''}`}
      style={{ left: table.x, top: table.y, width: HEAD_TABLE_SIZE, height: HEAD_TABLE_SIZE }}
      onMouseDown={props.onMouseDown}
      onClick={(e) => { e.stopPropagation(); props.onSelect(); }}
    >
      <div className="head-side-labels">
        <span className="side-tag groom" style={{ left: `${groomPos.leftPct}%`, top: `${groomPos.topPct}%` }}>男方</span>
        <span className="side-tag bride" style={{ left: `${bridePos.leftPct}%`, top: `${bridePos.topPct}%` }}>女方</span>
      </div>

      <div className="head-oval">
        <div className="head-center-label">
          {selected ? (
            <input
              value={table.label}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => props.dispatch({ type: 'updateTable', table: { ...table, label: e.target.value } })}
            />
          ) : (
            <>
              <span className="head-name">{table.label}</span>
              {(table.headIndex || 0) === 0 && <span className="head-crown">主位</span>}
            </>
          )}
          <span className="head-count">
            {selected ? (
              <>
                <input
                  type="number"
                  min={Math.max(2, seatCount(table))}
                  max={20}
                  value={table.capacity}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || table.capacity;
                    const nextCap = Math.max(Math.max(2, seatCount(table)), Math.min(20, val));
                    const order = [...table.seatOrder];
                    while (order.length < nextCap) order.push('');
                    order.length = nextCap;
                    props.dispatch({ type: 'updateTable', table: { ...table, capacity: nextCap, seatOrder: order } });
                  }}
                  style={{ width: 34, fontSize: 11 }}
                />
                座
              </>
            ) : (
              `${seatCount(table)}/${table.capacity}`
            )}
          </span>
        </div>
      </div>

      {/* 主位朝向箭头（主位上的人面朝的方向） */}
      <div
        className="main-seat-arrow"
        style={{ transform: `rotate(${mainAngle}deg)` }}
        title={`主位朝向：${venue.convention === 'facingDoor' ? '面门' : '面舞台'}`}
      >▲</div>

      <div className="table-seats head-seats">
        {Array.from({ length: table.capacity }).map((_, rank) => {
          const gid = seatAt(table, rank);
          const guest = gid ? guestById.get(gid) : null;
          const angle = slotAngle(rank, table, venue);
          const rad = (angle * Math.PI) / 180;
          const leftPct = 50 + Math.cos(rad) * 46;
          const topPct = 50 + Math.sin(rad) * 46;
          const kind = slotKind(rank, table.capacity);
          const conflicts = gid ? conflictMap.get(gid) || [] : [];
          const move = gid ? moveMap.get(gid) : undefined;
          const locked = (table.lockedSeatGuests || []).includes(gid);
          return (
            <div
              key={rank}
              className={`head-seat ${kind} ${gid ? 'occupied' : 'empty'} ${conflicts.length ? 'conflict' : ''} ${
                move?.kind === 'moved' ? 'moved' : ''
              } ${move?.kind === 'locked' ? 'stayed-locked' : ''} ${move?.kind === 'added' ? 'new-added' : ''} ${
                locked ? 'is-locked' : ''
              }`}
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.stopPropagation(); props.onSeatDrop(table.id, rank); }}
              onClick={(e) => e.stopPropagation()}
              title={
                move?.kind === 'moved'
                  ? `${guest?.name}：由「${tableLabel(plan, move.fromTableId)}」第 ${move.fromSeat} 位挪到第 ${move.toSeat} 位`
                  : kind === 'main'
                    ? '主位（1号位）：辈分最高者'
                    : kind === 'deputy'
                      ? '副主位'
                      : `${rank + 1}号位`
              }
            >
              <span className="rank-no">{kind === 'main' ? '主' : kind === 'deputy' ? '副' : rank + 1}</span>
              {guest ? (
                <>
                  <span className="seat-name">{guest.name}</span>
                  <button
                    className="pin-btn"
                    title={locked ? '取消固定（重排时此人不动）' : '固定位次（重排时此人不动）'}
                    onClick={(e) => { e.stopPropagation(); props.onToggleLock(gid); }}
                  >
                    {locked ? '🔒' : '📍'}
                  </button>
                </>
              ) : (
                <span className="seat-empty">{rank + 1}</span>
              )}
              {conflicts.length > 0 && <span className="seat-conflict">!</span>}
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="head-actions" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          {(table.headIndex || 0) !== 0 && <button onClick={props.onSetAsHead}>升为主桌</button>}
          <button onClick={() => props.onNudge(-36)} title="主位朝向逆时针转一档">主位左转</button>
          <button onClick={() => props.onNudge(36)} title="主位朝向顺时针转一档">主位右转</button>
          {(table.headIndex || 0) === 0 && <button onClick={props.onRerun}>按辈分重排</button>}
          <button onClick={props.onCancelHead}>取消主桌</button>
          <button className="danger" onClick={props.onRemove}>删除</button>
        </div>
      )}
    </div>
  );
}

function tableLabel(plan: Plan, id: string | null): string {
  if (!id) return '宾客池';
  return plan.tables.find((t) => t.id === id)?.label || '已删除的桌';
}

/* ------------------------------------------------------------------ */
/* 普通桌                                                             */
/* ------------------------------------------------------------------ */

interface NormalViewProps {
  table: Table;
  plan: Plan;
  selected: boolean;
  conflictMap: Map<string, string[]>;
  onMouseDown: (e: React.MouseEvent) => void;
  onSeatDrop: (tableId: string, index: number) => void;
  onSetAsHead: () => void;
  onRemove: () => void;
  dispatch: (cmd: Command) => void;
}

function NormalTableView(props: NormalViewProps) {
  const { table, plan, selected, conflictMap } = props;
  const isFull = table.seatOrder.length >= table.capacity;
  return (
    <div
      className={`table-item ${table.shape} ${selected ? 'selected' : ''} ${isFull ? 'full' : ''}`}
      style={{ left: table.x, top: table.y }}
      onMouseDown={props.onMouseDown}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="table-label">
        {selected ? (
          <input
            value={table.label}
            onChange={(e) => props.dispatch({ type: 'updateTable', table: { ...table, label: e.target.value } })}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 80, fontSize: 13 }}
          />
        ) : (
          <>{table.label} ({table.seatOrder.length}/{table.capacity})</>
        )}
      </div>
      {selected && (
        <div className="table-capacity-edit" onClick={(e) => e.stopPropagation()}>
          人数:
          <input
            type="number"
            value={table.capacity}
            min={table.seatOrder.length}
            max={20}
            onChange={(e) => {
              const val = parseInt(e.target.value) || table.capacity;
              props.dispatch({
                type: 'updateTable',
                table: { ...table, capacity: Math.max(table.seatOrder.length, Math.min(20, val)) },
              });
            }}
            style={{ width: 40, marginLeft: 4 }}
          />
        </div>
      )}
      <div className="table-seats">
        {Array.from({ length: table.capacity }).map((_, i) => {
          const gid = table.seatOrder[i];
          const guest = gid ? plan.guests.find((g) => g.id === gid) : null;
          const conflicts = gid ? conflictMap.get(gid) || [] : [];
          return (
            <div
              key={i}
              className={`seat-cell ${gid ? 'occupied' : 'empty'} ${conflicts.length ? 'conflict' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.stopPropagation(); props.onSeatDrop(table.id, i); }}
              onClick={(e) => e.stopPropagation()}
            >
              {guest ? (
                <>
                  <span className="seat-name">{guest.name}</span>
                  {conflicts.length > 0 && <span className="seat-conflict">!</span>}
                </>
              ) : (
                <span className="seat-empty">{i + 1}号</span>
              )}
            </div>
          );
        })}
      </div>
      {selected && (
        <div className="table-actions">
          <button onClick={(e) => { e.stopPropagation(); props.onSetAsHead(); }}>★ 设为主桌</button>
          <button onClick={(e) => { e.stopPropagation(); props.onRemove(); }}>删除</button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 编排结果留痕面板：谁被挪过、挪到第几位                            */
/* ------------------------------------------------------------------ */

function ArrangeReportPanel({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const r = plan.report!;
  const moved = r.moves.filter((m) => m.kind === 'moved');
  const added = r.moves.filter((m) => m.kind === 'added');
  const kept = r.moves.filter((m) => m.kind === 'kept' || m.kind === 'locked');
  const nameOf = (id: string) => plan.guests.find((g) => g.id === id)?.name || id;
  const tableOf = (id: string) => plan.tables.find((t) => t.id === id)?.label || id;

  return (
    <div className="arrange-report">
      <div className="report-head">
        <b>最近一次主桌编排</b>
        <span className="report-reason">{r.reason}</span>
        <button onClick={onClose}>×</button>
      </div>
      {r.split && (
        <div className="report-split-warn">
          一桌坐不下，已自动分成 {r.headTableCount} 桌（主位与朝向保持不变）
        </div>
      )}
      <div className="report-summary">
        共 {r.moves.length} 人：挪动 {moved.length} · 新入座 {added.length} · 未动 {kept.length}
      </div>
      <div className="report-moves">
        {r.moves.map((m) => (
          <div key={m.guestId} className={`report-move ${m.kind}`}>
            <span className="move-name">{nameOf(m.guestId)}</span>
            {m.kind === 'kept' && <span className="move-text">位次不变（{tableOf(m.toTableId)} 第 {m.toSeat} 位）</span>}
            {m.kind === 'locked' && <span className="move-text">已固定，保留在 {tableOf(m.toTableId)} 第 {m.toSeat} 位</span>}
            {m.kind === 'added' && (
              <span className="move-text">新入座 → {tableOf(m.toTableId)} 第 {m.toSeat} 位</span>
            )}
            {m.kind === 'moved' && (
              <span className="move-text">
                {m.fromTableId !== m.toTableId ? `${tableOf(m.fromTableId || '')} ` : ''}第 {m.fromSeat} 位 →{' '}
                {tableOf(m.toTableId)} 第 <b>{m.toSeat}</b> 位
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
