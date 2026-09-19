import { v4 as uuidv4 } from 'uuid';
import type { Plan, Table } from './types';

export function generateId(): string {
  return uuidv4();
}

/** 实际入座人数（稀疏 seatOrder 中的非空位数） */
export function occupiedCount(t: Table): number {
  return t.seatOrder.filter((id): id is string => !!id).length;
}

export function seatHas(t: Table, guestId: string): boolean {
  return t.seatOrder.includes(guestId);
}

/** 找宾客所在桌与位次号（1 起） */
export function findSeat(plan: Plan, guestId: string): { table: Table; seatIndex: number } | null {
  for (const t of plan.tables) {
    const i = t.seatOrder.indexOf(guestId);
    if (i >= 0) return { table: t, seatIndex: i };
  }
  return null;
}

export function createEmptyPlan(name = '未命名方案'): Plan {
  return {
    id: generateId(),
    name,
    tables: [],
    guests: [],
    rules: [],
    updatedAt: Date.now(),
    venue: { entranceSide: 'south', stageSide: 'north' },
    seatMarks: [],
  };
}

export function clonePlan(plan: Plan): Plan {
  return JSON.parse(JSON.stringify(plan));
}

export function getConflictMap(plan: Plan): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const { tables, rules } = plan;

  for (const rule of rules) {
    if (rule.type === 'apart') {
      for (const table of tables) {
        const hasA = seatHas(table, rule.a);
        const hasB = seatHas(table, rule.b);
        if (hasA && hasB) {
          if (!map.has(rule.a)) map.set(rule.a, []);
          if (!map.has(rule.b)) map.set(rule.b, []);
          if (!map.get(rule.a)!.includes(rule.b)) map.get(rule.a)!.push(rule.b);
          if (!map.get(rule.b)!.includes(rule.a)) map.get(rule.b)!.push(rule.a);
        }
      }
    } else if (rule.type === 'separate') {
      for (const table of tables) {
        const hasA = seatHas(table, rule.a);
        const hasB = seatHas(table, rule.b);
        if (hasA && hasB) {
          if (!map.has(rule.a)) map.set(rule.a, []);
          if (!map.has(rule.b)) map.set(rule.b, []);
          if (!map.get(rule.a)!.includes(rule.b)) map.get(rule.a)!.push(rule.b);
          if (!map.get(rule.b)!.includes(rule.a)) map.get(rule.b)!.push(rule.a);
        }
      }
    } else if (rule.type === 'together') {
      let same = false;
      for (const table of tables) {
        const hasA = seatHas(table, rule.a);
        const hasB = seatHas(table, rule.b);
        if (hasA && hasB) same = true;
      }
      if (!same) {
        const ta = tables.find((t) => seatHas(t, rule.a));
        const tb = tables.find((t) => seatHas(t, rule.b));
        if (ta && tb && ta.id !== tb.id) {
          if (!map.has(rule.a)) map.set(rule.a, []);
          if (!map.has(rule.b)) map.set(rule.b, []);
          if (!map.get(rule.a)!.includes(rule.b)) map.get(rule.a)!.push(rule.b);
          if (!map.get(rule.b)!.includes(rule.a)) map.get(rule.b)!.push(rule.a);
        }
      }
    }
  }
  return map;
}

export function getTableStats(plan: Plan) {
  let seated = 0;
  let capacity = 0;
  let emptySeats = 0;
  const unassigned = plan.guests.filter((g) => {
    const atTable = plan.tables.some((t) => seatHas(t, g.id));
    return !atTable;
  });
  for (const t of plan.tables) {
    seated += occupiedCount(t);
    capacity += t.capacity;
    emptySeats += Math.max(0, t.capacity - occupiedCount(t));
  }
  return { seated, capacity, emptySeats, totalGuests: plan.guests.length, unassignedCount: unassigned.length };
}

export function parseGuestsText(text: string): { name: string; tags: string[] }[] {
  const lines = text.split(/\n|，|,|;/).map((s) => s.trim()).filter(Boolean);
  const result: { name: string; tags: string[] }[] = [];
  for (const line of lines) {
    const parts = line.split(/\s+/);
    const name = parts[0];
    const tags = parts.slice(1);
    if (name) result.push({ name, tags });
  }
  return result;
}

export function exportPlanToJSON(plan: Plan): string {
  return JSON.stringify(plan, null, 2);
}

export function importPlanFromJSON(json: string): Plan | null {
  try {
    const p = JSON.parse(json);
    if (p.id && p.name && Array.isArray(p.tables) && Array.isArray(p.guests) && Array.isArray(p.rules)) {
      return p as Plan;
    }
  } catch {}
  return null;
}
