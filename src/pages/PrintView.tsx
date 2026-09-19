import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPlan } from '../db';
import type { Plan as PlanType, SeatMark } from '../types';
import { isHeadGroup, resolveHeadFacing, facingLabel } from '../headSeating';
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

function TableCards({ plan }: { plan: PlanType }) {
  const facing = resolveHeadFacing(plan.venue);
  const markMap = new Map<string, SeatMark>();
  for (const m of plan.seatMarks ?? []) markMap.set(m.guestId, m);
  // 主桌排在最前
  const tables = [...plan.tables].sort((a, b) => {
    const av = a.isHeadTable ? 0 : a.isSecondaryHead ? 1 : 2;
    const bv = b.isHeadTable ? 0 : b.isSecondaryHead ? 1 : 2;
    return av - bv;
  });
  return (
    <div className="table-cards">
      {tables.map((table) => {
        const head = isHeadGroup(table);
        return (
          <div key={table.id} className={`table-card ${table.isHeadTable ? 'head-card' : ''} ${table.isSecondaryHead ? 'secondary-card' : ''}`}>
            <div className="card-header">
              {table.isHeadTable ? '👑 ' : table.isSecondaryHead ? '副·' : ''}{table.label}
              {head && <span className="card-facing">主位面向{facingLabel(facing)}方</span>}
            </div>
            <div className="card-seats">
              {Array.from({ length: table.capacity }).map((_, i) => {
                const gid = table.seatOrder[i] ?? null;
                const guest = gid ? plan.guests.find((g) => g.id === gid) : null;
                const mark = gid ? markMap.get(gid) : undefined;
                const moved = mark && (mark.prevTableId !== table.id || mark.prevSeatNo !== i + 1);
                return (
                  <div key={i} className={`card-seat ${!guest ? 'empty' : ''} ${i === 0 && table.isHeadTable ? 'card-head-seat' : ''}`}>
                    <span className="seat-number">{i + 1}号位{i === 0 && table.isHeadTable ? '（主位）' : ''}</span>
                    <span className="seat-guest">
                      {guest ? guest.name : '（空）'}
                      {guest?.easyAccess ? ' 🚪' : ''}
                      {guest && moved && <em className="card-moved">（{mark!.prevSeatNo ? `${mark!.prevSeatNo}→` : '新→'}{i + 1}）</em>}
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
  return (
    <div className="layout-diagram">
      <h2>{plan.name} - 座位总图</h2>
      <div className="layout-canvas">
        {plan.tables.map((table) => (
          <div
            key={table.id}
            className={`layout-table ${table.shape} ${table.isHeadTable ? 'layout-head' : ''} ${table.isSecondaryHead ? 'layout-secondary' : ''}`}
            style={{ left: table.x, top: table.y }}
          >
            <div className="layout-label">{table.isHeadTable ? '👑 ' : table.isSecondaryHead ? '副·' : ''}{table.label}</div>
            <div className="layout-guests">
              {table.seatOrder.map((gid, i) => {
                if (!gid) return null;
                const guest = plan.guests.find((g) => g.id === gid);
                return <span key={i} className="layout-guest">{guest?.name}</span>;
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
            const seatIndex = table ? table.seatOrder.indexOf(g.id) + 1 : '-';
            return (
              <tr key={g.id}>
                <td>{i + 1}</td>
                <td>{g.name}</td>
                <td>{g.tags.join(', ')}</td>
                <td>{table?.label || '未分配'}</td>
                <td>{seatIndex}</td>
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
