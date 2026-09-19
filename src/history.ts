import type { Command, Plan, SeatMark } from './types';

function upsertMark(marks: SeatMark[], mark: SeatMark) {
  const i = marks.findIndex((m) => m.guestId === mark.guestId);
  if (i >= 0) marks[i] = mark;
  else marks.push(mark);
}

export type HistoryManager = {
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => Plan | null;
  redo: () => Plan | null;
  push: (plan: Plan, command: Command) => void;
  current: () => Plan;
};

export function createHistoryManager(initial: Plan): HistoryManager {
  let past: Plan[] = [deepClone(initial)];
  let future: Plan[] = [];

  function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  function applyCommand(plan: Plan, command: Command): Plan {
    const p = deepClone(plan);
    switch (command.type) {
      case 'updatePlan':
        return deepClone(command.plan);
      case 'updateTables':
        p.tables = deepClone(command.tables);
        break;
      case 'updateGuests':
        p.guests = deepClone(command.guests);
        break;
      case 'updateRules':
        p.rules = deepClone(command.rules);
        break;
      case 'updateTable': {
        const idx = p.tables.findIndex((t) => t.id === command.table.id);
        if (idx >= 0) p.tables[idx] = deepClone(command.table);
        break;
      }
      case 'addGuest':
        p.guests.push(deepClone(command.guest));
        break;
      case 'removeGuest': {
        p.guests = p.guests.filter((g) => g.id !== command.guestId);
        p.tables.forEach((t) => {
          t.seatOrder = t.seatOrder.map((id) => (id === command.guestId ? null : id));
        });
        p.rules = p.rules.filter((r) => r.a !== command.guestId && r.b !== command.guestId);
        break;
      }
      case 'addTable':
        p.tables.push(deepClone(command.table));
        break;
      case 'removeTable': {
        p.tables = p.tables.filter((t) => t.id !== command.tableId);
        break;
      }
      case 'moveGuest': {
        const { guestId, fromTableId, toTableId, toIndex } = command;
        const marks = p.seatMarks ? deepClone(p.seatMarks) : [];
        const findMark = (id: string) => marks.find((m) => m.guestId === id);

        // 先记录来源位次（座位稍后才会被清空）
        let fromSeatNo: number | null = null;
        if (fromTableId) {
          const ft0 = p.tables.find((t) => t.id === fromTableId);
          const k = ft0?.seatOrder.indexOf(guestId) ?? -1;
          fromSeatNo = k >= 0 ? k + 1 : null;
        }

        if (fromTableId) {
          const ft = p.tables.find((t) => t.id === fromTableId);
          if (ft) ft.seatOrder = ft.seatOrder.map((id) => (id === guestId ? null : id));
        }
        let occupant: string | null = null;
        let targetSeatNo = 0;
        if (toTableId) {
          const tt = p.tables.find((t) => t.id === toTableId);
          if (tt) {
            // 保证长度覆盖目标号位；空号位以 null 保留（副桌从通道端起排）
            while (tt.seatOrder.length < tt.capacity) tt.seatOrder.push(null);
            const idx = toIndex !== undefined
              ? Math.max(0, Math.min(toIndex, tt.capacity - 1))
              : tt.seatOrder.findIndex((id) => id === null);
            const at = idx >= 0 ? idx : tt.seatOrder.length;
            targetSeatNo = at + 1;
            // 目标位若已有别人，把对方换到来源位（拖拽换位），避免覆盖丢人
            occupant = tt.seatOrder[at];
            tt.seatOrder[at] = guestId;
            let occupantSeatNo = 0;
            if (occupant && occupant !== guestId && fromTableId) {
              const ft2 = p.tables.find((t) => t.id === fromTableId);
              const fromIdx = ft2?.seatOrder.findIndex((id) => id === null);
              if (ft2 && fromIdx !== undefined && fromIdx >= 0) {
                ft2.seatOrder[fromIdx] = occupant;
                occupantSeatNo = fromIdx + 1;
              }
            }
            // 记录/更新本次挪动：起点沿用清单中最初位次，没有则为本次来源
            const prevMark = findMark(guestId);
            upsertMark(marks, {
              guestId,
              tableId: toTableId,
              seatNo: targetSeatNo,
              prevSeatNo: prevMark?.prevSeatNo ?? fromSeatNo,
              prevTableId: prevMark?.prevTableId ?? fromTableId,
              reason: '手动调整',
              changedAt: Date.now(),
            });
            if (occupant && occupant !== guestId && fromTableId) {
              const om = findMark(occupant);
              upsertMark(marks, {
                guestId: occupant,
                tableId: fromTableId,
                seatNo: occupantSeatNo,
                prevSeatNo: om?.prevSeatNo ?? targetSeatNo,
                prevTableId: om?.prevTableId ?? toTableId,
                reason: '拖拽换位',
                changedAt: Date.now(),
              });
            }
          }
        }
        p.seatMarks = marks;
        break;
      }
      case 'arrangeHeadTable': {
        p.tables = deepClone(command.tables);
        p.seatMarks = deepClone(command.marks);
        break;
      }
      case 'switchHeadTable': {
        p.tables = deepClone(command.tables);
        p.seatMarks = deepClone(command.marks);
        break;
      }
      case 'updateVenue':
        p.venue = deepClone(command.venue);
        break;
      case 'clearSeatMarks':
        p.seatMarks = [];
        break;
      case 'batch': {
        let result = p;
        for (const c of command.commands) {
          result = applyCommand(result, c);
        }
        return result;
      }
    }
    return p;
  }

  return {
    canUndo: () => past.length > 1,
    canRedo: () => future.length > 0,
    undo: () => {
      if (past.length <= 1) return null;
      future.push(past.pop()!);
      return deepClone(past[past.length - 1]);
    },
    redo: () => {
      if (future.length === 0) return null;
      const p = future.pop()!;
      past.push(p);
      return deepClone(p);
    },
    push: (plan, command) => {
      const next = applyCommand(plan, command);
      past.push(next);
      if (past.length > 51) past.shift();
      future = [];
    },
    current: () => deepClone(past[past.length - 1]),
  };
}
