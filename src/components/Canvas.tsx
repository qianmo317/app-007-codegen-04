import { useState, useRef, useEffect } from 'react';
import type { Plan, Table, Command } from '../types';
import { generateId, occupiedCount } from '../utils';
import { buildSlots, describeSeat, isHeadGroup, resolveHeadFacing } from '../headSeating';

interface Props {
  plan: Plan;
  dragGuestId: string | null;
  setDragGuestId: (id: string | null) => void;
  conflictMap: Map<string, string[]>;
  dispatch: (cmd: Command) => void;
  selectedTableId: string | null;
  setSelectedTableId: (id: string | null) => void;
}

export default function Canvas({ plan, dragGuestId, setDragGuestId, conflictMap, dispatch, selectedTableId, setSelectedTableId }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggingTable, setDraggingTable] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showTableMenu, setShowTableMenu] = useState<{ x: number; y: number } | null>(null);

  const facing = resolveHeadFacing(plan.venue);
  const marksByGuest = new Map<string, { seatNo: number; prevSeatNo: number | null; prevTableId: string | null; reason: string }>();
  for (const m of plan.seatMarks ?? []) {
    marksByGuest.set(m.guestId, { seatNo: m.seatNo, prevSeatNo: m.prevSeatNo, prevTableId: m.prevTableId, reason: m.reason });
  }

  const handleDropOnCanvas = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragGuestId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const table = plan.tables.find((t) => {
      const tx = t.x, ty = t.y;
      const w = t.shape === 'round' ? 260 : 280;
      const h = t.shape === 'round' ? 280 : 200;
      return x >= tx && x <= tx + w && y >= ty && y <= ty + h;
    });
    if (table) {
      const fromTable = plan.tables.find((t) => t.seatOrder.includes(dragGuestId));
      if (fromTable?.id === table.id) return;
      if (occupiedCount(table) >= table.capacity) {
        alert('该桌已满');
        return;
      }
      dispatch({
        type: 'moveGuest',
        guestId: dragGuestId,
        fromTableId: fromTable?.id || null,
        toTableId: table.id,
      });
    }
    setDragGuestId(null);
  };

  const handleTableMouseDown = (e: React.MouseEvent, table: Table) => {
    if ((e.target as HTMLElement).closest('.table-seats')) return;
    if ((e.target as HTMLElement).closest('button, input, select')) return;
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
    const count = plan.tables.filter((t) => t.shape === shape).length + 1;
    const table: Table = {
      id,
      label: `${shape === 'round' ? '圆' : '长'}桌${count}`,
      x: 50 + (plan.tables.length % 4) * 300,
      y: 80 + Math.floor(plan.tables.length / 4) * 300,
      shape,
      capacity: shape === 'round' ? 10 : 10,
      seatOrder: [],
    };
    dispatch({ type: 'addTable', table });
  };

  const removeTable = (tableId: string) => {
    if (!confirm('确定删除该桌？')) return;
    const target = plan.tables.find((t) => t.id === tableId);
    // 删除主桌/副桌时，把同组另一桌也还原为普通桌
    if (target?.isHeadTable || target?.isSecondaryHead) {
      const tables = plan.tables
        .filter((t) => t.id !== tableId)
        .map((t) =>
          t.headGroupId === target.headGroupId
            ? { ...t, isHeadTable: false, isSecondaryHead: false, headGroupId: undefined }
            : t,
        );
      dispatch({ type: 'updateTables', tables });
    } else {
      dispatch({ type: 'removeTable', tableId });
    }
    setSelectedTableId(null);
  };

  const handleSeatDrop = (tableId: string, index: number) => {
    if (!dragGuestId) return;
    const fromTable = plan.tables.find((t) => t.seatOrder.includes(dragGuestId));
    const toTable = plan.tables.find((t) => t.id === tableId)!;
    if (toTable.seatOrder.includes(dragGuestId)) {
      dispatch({ type: 'moveGuest', guestId: dragGuestId, fromTableId: tableId, toTableId: tableId, toIndex: index });
    } else {
      if (occupiedCount(toTable) >= toTable.capacity) {
        alert('该桌已满');
        return;
      }
      dispatch({ type: 'moveGuest', guestId: dragGuestId, fromTableId: fromTable?.id || null, toTableId: tableId, toIndex: index });
    }
    setDragGuestId(null);
  };

  return (
    <div className="canvas-panel">
      <div className="canvas-toolbar">
        <button onClick={() => addTable('round')}>+ 圆桌</button>
        <button onClick={() => addTable('rect')}>+ 长条桌</button>
        <span className="canvas-hint">点击桌子选中，可在上方「换用此桌为主桌」；拖动调整位置</span>
      </div>
      <div
        className="canvas-area"
        ref={canvasRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropOnCanvas}
        onContextMenu={(e) => { e.preventDefault(); setShowTableMenu({ x: e.clientX, y: e.clientY }); }}
        onClick={() => { setSelectedTableId(null); setShowTableMenu(null); }}
      >
        {/* 场地朝向标识 */}
        <div className={`venue-marker entrance marker-${plan.venue?.entranceSide ?? 'south'}`}>🚪 进门</div>
        {plan.venue?.stageSide && plan.venue.stageSide !== null && (
          <div className={`venue-marker stage marker-${plan.venue.stageSide}`}>🎤 舞台</div>
        )}

        {plan.tables.map((table) => {
          const isSelected = selectedTableId === table.id;
          const count = occupiedCount(table);
          const isFull = count >= table.capacity;
          const head = isHeadGroup(table);
          const slots = head ? buildSlots(table.capacity) : null;
          return (
            <div
              key={table.id}
              className={[
                'table-item',
                table.shape,
                isSelected ? 'selected' : '',
                isFull ? 'full' : '',
                table.isHeadTable ? 'head-table' : '',
                table.isSecondaryHead ? 'secondary-head' : '',
              ].filter(Boolean).join(' ')}
              style={{ left: table.x, top: table.y }}
              onMouseDown={(e) => handleTableMouseDown(e, table)}
            >
              {table.isHeadTable && (
                <div className={`head-crown facing-${facing}`} title={`主位朝向：面向${{ north: '北', south: '南', east: '东', west: '西' }[facing]}`}>
                  👑<span className="facing-arrow">{{ north: '↑', south: '↓', east: '→', west: '←' }[facing]}</span>
                </div>
              )}
              <div className="table-label">
                {isSelected ? (
                  <input
                    value={table.label}
                    onChange={(e) => dispatch({ type: 'updateTable', table: { ...table, label: e.target.value } })}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: 90, fontSize: 13 }}
                  />
                ) : (
                  <>{table.isHeadTable ? '👑 ' : table.isSecondaryHead ? '副·' : ''}{table.label} ({count}/{table.capacity})</>
                )}
              </div>
              {isSelected && (
                <div className="table-capacity-edit" onClick={(e) => e.stopPropagation()}>
                  人数:
                  <input
                    type="number"
                    value={table.capacity}
                    min={count}
                    max={20}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || table.capacity;
                      dispatch({ type: 'updateTable', table: { ...table, capacity: Math.max(count, Math.min(20, val)) } });
                    }}
                    style={{ width: 40, marginLeft: 4 }}
                  />
                </div>
              )}
              <div className="table-seats">
                {Array.from({ length: table.capacity }).map((_, i) => {
                  const gid = table.seatOrder[i] ?? null;
                  const guest = gid ? plan.guests.find((g) => g.id === gid) : null;
                  const conflicts = gid ? conflictMap.get(gid) || [] : [];
                  const isConflict = conflicts.length > 0;
                  const mark = gid && head ? marksByGuest.get(gid) : null;
                  const moved = mark && (mark.prevTableId !== table.id || mark.prevSeatNo !== i + 1);
                  const slot = slots?.[i];
                  const isHeadSeat = head && i === 0;
                  const isAisle = head && slot && slot.aisle > 0.7;
                  const tip = head ? describeSeat(i, table.capacity, facing) : `${i + 1}号位`;
                  return (
                    <div
                      key={i}
                      className={[
                        'seat-cell',
                        gid ? 'occupied' : 'empty',
                        isConflict ? 'conflict' : '',
                        isHeadSeat ? 'head-seat' : '',
                        isAisle ? 'aisle-seat' : '',
                        moved ? 'moved' : '',
                      ].filter(Boolean).join(' ')}
                      title={guest ? `${guest.name} · ${tip}${moved ? `\n上次：${mark?.prevSeatNo ? `第${mark.prevSeatNo}位` : '未入座'}（${mark?.reason}）` : ''}` : tip}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.stopPropagation(); handleSeatDrop(table.id, i); }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {guest ? (
                        <>
                          <span className="seat-no">{i + 1}</span>
                          <span className="seat-name">{guest.name}</span>
                          {guest.easyAccess && <span className="easy-badge" title="近通道优先">🚪</span>}
                          {isConflict && <span className="seat-conflict">!</span>}
                          {moved && (
                            <span className="moved-badge" title={`原：${mark?.prevSeatNo ? `第${mark.prevSeatNo}位` : '未入座'} → 现：第${i + 1}位`}>
                              {mark?.prevSeatNo ? `${mark.prevSeatNo}→${i + 1}` : `新→${i + 1}`}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="seat-empty">
                          <b>{i + 1}</b>{isHeadSeat ? ' 主位' : isAisle ? ' 通道侧' : ''}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {isSelected && (
                <div className="table-actions">
                  <button onClick={(e) => { e.stopPropagation(); removeTable(table.id); }}>删除</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {showTableMenu && (
        <div className="context-menu" style={{ left: showTableMenu.x, top: showTableMenu.y }} onClick={(e) => e.stopPropagation()}>
          <div onClick={() => { addTable('round'); setShowTableMenu(null); }}>添加圆桌</div>
          <div onClick={() => { addTable('rect'); setShowTableMenu(null); }}>添加长条桌</div>
        </div>
      )}
    </div>
  );
}
