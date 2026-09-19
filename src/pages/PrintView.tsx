import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPlan } from '../db';
import type { Plan as PlanType } from '../types';
import { HEAD_ROLE_LABELS, seatAt, slotKind } from '../headTable';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function PrintView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanType | null>(null);
  const [tab, setTab] = useState<'cards' | 'layout' | 'checkin'>('cards');
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    getPlan(id).then((p) => setPlan(p || null));
  }, [id]);

  const exportPNG = async () => {
    if (!printRef.current) return;
    const canvas = await html2canvas(printRef.current, { scale: 2 });
    const link = document.createElement('a');
    link.download = `${plan?.name || '座位图'}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const exportPDF = async () => {
    if (!printRef.current) return;
    const canvas = await html2canvas(printRef.current, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('l', 'mm', 'a4');
    const imgWidth = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    pdf.save(`${plan?.name || '座位图'}.pdf`);
  };

  if (!plan) return <div>加载中...</div>;

  return (
    <div className="print-view">
      <header className="print-header">
        <button onClick={() => navigate(`/plan/${id}`)}>返回编辑</button>
        <div className="print-tabs">
          <button className={tab === 'cards' ? 'active' : ''} onClick={() => setTab('cards')}>桌牌</button>
          <button className={tab === 'layout' ? 'active' : ''} onClick={() => setTab('layout')}>座位图</button>
          <button className={tab === 'checkin' ? 'active' : ''} onClick={() => setTab('checkin')}>签到表</button>
        </div>
        <div className="print-actions">
          <button onClick={exportPNG}>导出 PNG</button>
          <button onClick={exportPDF}>导出 PDF</button>
          <button onClick={() => window.print()}>打印</button>
        </div>
      </header>
      <div className="print-content" ref={printRef}>
        {tab === 'cards' && <TableCards plan={plan} />}
        {tab === 'layout' && <LayoutDiagram plan={plan} />}
        {tab === 'checkin' && <CheckInSheet plan={plan} />}
      </div>
    </div>
  );
}

function seatLabel(rank: number, capacity: number): string {
  const kind = slotKind(rank, capacity);
  if (kind === 'main') return '主位（1号位）';
  if (kind === 'deputy') return '副主位';
  return `${rank + 1}号位`;
}

function TableCards({ plan }: { plan: PlanType }) {
  return (
    <div className="table-cards">
      {plan.tables.map((table) => {
        const isHead = !!table.isHead;
        const roleOf = (gid: string) => {
          const g = plan.guests.find((x) => x.id === gid);
          return g?.headRole ? HEAD_ROLE_LABELS[g.headRole] : '';
        };
        return (
          <div key={table.id} className={`table-card ${isHead ? 'head-card' : ''}`}>
            <div className="card-header">
              {isHead && '★ '}
              {table.label}
              {isHead && <span className="card-sub">（主位面{plan.venue?.convention === 'facingStage' ? '舞台' : '门'}）</span>}
            </div>
            <div className="card-seats">
              {Array.from({ length: table.capacity }).map((_, i) => {
                const gid = isHead ? seatAt(table, i) : table.seatOrder[i];
                const guest = gid ? plan.guests.find((g) => g.id === gid) : null;
                const kind = isHead ? slotKind(i, table.capacity) : undefined;
                return (
                  <div key={i} className={`card-seat ${!gid ? 'empty' : ''} ${kind || ''}`}>
                    <span className="seat-number">{isHead ? seatLabel(i, table.capacity) : `${i + 1}号位`}</span>
                    <span className="seat-guest">
                      {guest?.name || '（空）'}
                      {gid && roleOf(gid) && <em className="seat-role-print">{roleOf(gid)}</em>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LayoutDiagram({ plan }: { plan: PlanType }) {
  const venue = plan.venue;
  return (
    <div className="layout-diagram">
      <h2>{plan.name} - 座位总图</h2>
      <div className="layout-canvas">
        {venue && (
          <>
            <div className={`layout-anchor stage side-${venue.stageSide}`}>舞台</div>
            <div className={`layout-anchor door side-${venue.doorSide}`}>大门</div>
          </>
        )}
        {plan.tables.map((table) => (
          <div
            key={table.id}
            className={`layout-table ${table.shape} ${table.isHead ? 'is-head' : ''}`}
            style={{ left: table.x, top: table.y }}
          >
            <div className="layout-label">{table.isHead ? '★ ' : ''}{table.label}</div>
            <div className="layout-guests">
              {table.seatOrder.filter(Boolean).map((gid, i) => {
                const guest = plan.guests.find((g) => g.id === gid);
                return <span key={`${gid}-${i}`} className="layout-guest">{guest?.name}</span>;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckInSheet({ plan }: { plan: PlanType }) {
  const sorted = [...plan.guests].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  return (
    <div className="checkin-sheet">
      <h2>{plan.name} - 签到表</h2>
      <table>
        <thead>
          <tr>
            <th>序号</th>
            <th>姓名</th>
            <th>标签</th>
            <th>桌号</th>
            <th>位次</th>
            <th>签到</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((g, i) => {
            const table = plan.tables.find((t) => t.seatOrder.includes(g.id));
            let seatText = '-';
            if (table) {
              const rank = table.seatOrder.indexOf(g.id);
              seatText = table.isHead ? seatLabel(rank, table.capacity) : String(rank + 1);
            }
            const role = g.headRole ? HEAD_ROLE_LABELS[g.headRole] : '';
            return (
              <tr key={g.id}>
                <td>{i + 1}</td>
                <td>{g.name}</td>
                <td>{[role, ...g.tags].filter(Boolean).join(', ')}</td>
                <td>{table?.isHead ? `★ ${table.label}` : table?.label || '未分配'}</td>
                <td>{seatText}</td>
                <td className="sign-box"></td>
                <td>{g.note || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
