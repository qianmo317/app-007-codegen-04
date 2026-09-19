import { useState } from 'react';
import type { Plan } from '../types';

interface Props {
  plan: Plan;
}

/** 最近一次主桌重排的变动清单：谁被挪过、从第几位到第几位、去了哪桌 */
export default function MarksPanel({ plan }: Props) {
  const [open, setOpen] = useState(true);
  const marks = plan.seatMarks ?? [];
  if (marks.length === 0) return null;

  const moved = marks.filter((m) => m.prevTableId !== m.tableId || m.prevSeatNo !== m.seatNo);
  const unchanged = marks.length - moved.length;
  const tableName = (id: string | null) =>
    id ? plan.tables.find((t) => t.id === id)?.label ?? '其他桌' : '宾客池';
  const guestName = (id: string) => plan.guests.find((g) => g.id === id)?.name ?? '?';

  return (
    <div className={`marks-dock ${open ? '' : 'collapsed'}`}>
      <div className="marks-dock-head" onClick={() => setOpen((o) => !o)}>
        <span>📋 位次变动清单</span>
        <span className="marks-count">
          挪动 <b>{moved.length}</b> 人{unchanged > 0 ? ` · 原位不动 ${unchanged} 人` : ''}
        </span>
        <span className="marks-toggle">{open ? '收起 ▾' : '展开 ▴'}</span>
      </div>
      {open && (
        <div className="marks-dock-body">
          {moved.length === 0 && <div className="marks-empty">本次重排没有人改变位次</div>}
          {moved.map((m) => (
            <div key={m.guestId} className="mark-row">
              <span className="mark-name">{guestName(m.guestId)}</span>
              <span className="mark-move">
                {m.prevSeatNo ? `${tableName(m.prevTableId)} 第${m.prevSeatNo}位` : '宾客池'}
                {' → '}
                <b>{tableName(m.tableId)} 第{m.seatNo}位</b>
              </span>
              <span className="mark-reason">{m.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
