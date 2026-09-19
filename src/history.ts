import type { Command, Plan } from './types';

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

  /** 手动改动（拖拽、删除等）后，清掉上一次自动编排的挪动留痕，避免误导 */
  function clearReport(p: Plan) {
    if (p.report) p.report = null;
  }

  function seatCount(t: { seatOrder: string[] }): number {
    return t.seatOrder.reduce((n, id) => n + (id ? 1 : 0), 0);
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
        clearReport(p);
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
        clearReport(p);
        break;
      case 'removeGuest': {
        p.guests = p.guests.filter((g) => g.id !== command.guestId);
        p.tables.forEach((t) => {
          t.seatOrder = t.seatOrder.map((id) => (id === command.guestId ? '' : id));
          if (t.lockedSeatGuests) {
            t.lockedSeatGuests = t.lockedSeatGuests.filter((id) => id !== command.guestId);
          }
        });
        p.rules = p.rules.filter((r) => r.a !== command.guestId && r.b !== command.guestId);
        clearReport(p);
        break;
      }
      case 'addTable':
        p.tables.push(deepClone(command.table));
        break;
      case 'removeTable': {
        p.tables = p.tables.filter((t) => t.id !== command.tableId);
        clearReport(p);
        break;
      }
      case 'moveGuest': {
        const { guestId, fromTableId, toTableId, toIndex } = command;
        if (fromTableId) {
          const ft = p.tables.find((t) => t.id === fromTableId);
          if (ft) ft.seatOrder = ft.seatOrder.map((id) => (id === guestId ? '' : id));
        }
        if (toTableId) {
          const tt = p.tables.find((t) => t.id === toTableId);
          if (tt) {
            const isHeadSparse = !!tt.isHead;
            const without = tt.seatOrder.map((id) => (id === guestId ? '' : id));
            if (isHeadSparse) {
              // 主桌：位次号是荣誉位，直接放到指定位次，允许中间空位
              while (without.length < tt.capacity) without.push('');
              const idx = Math.max(0, Math.min(toIndex ?? seatCount(tt), tt.capacity - 1));
              without[idx] = guestId;
              tt.seatOrder = without;
            } else {
              const compact = without.filter(Boolean);
              const idx =
                toIndex !== undefined
                  ? Math.max(0, Math.min(toIndex, compact.length))
                  : compact.length;
              compact.splice(idx, 0, guestId);
              tt.seatOrder = compact;
            }
          }
        }
        clearReport(p);
        break;
      }
      case 'updateVenue':
        p.venue = deepClone(command.venue);
        break;
      case 'arrangeHead':
        p.tables = deepClone(command.tables);
        p.report = deepClone(command.report);
        break;
      case 'setReport':
        p.report = command.report ? deepClone(command.report) : null;
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
