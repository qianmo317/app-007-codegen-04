import type { Command, Facing, Plan, Venue } from '../types';
import { arrangeHeadTable, collectHeadGuests, facingLabel, resolveHeadFacing, switchHeadTable } from '../headSeating';

interface Props {
  plan: Plan;
  dispatch: (cmd: Command) => void;
  selectedTableId: string | null;
  onHeadTableChange?: (id: string) => void;
}

const SIDES: { value: Facing; label: string; arrow: string }[] = [
  { value: 'north', label: '北', arrow: '↑' },
  { value: 'east', label: '东', arrow: '→' },
  { value: 'south', label: '南', arrow: '↓' },
  { value: 'west', label: '西', arrow: '←' },
];

export default function VenueBar({ plan, dispatch, selectedTableId, onHeadTableChange }: Props) {
  const venue: Venue = plan.venue ?? { entranceSide: 'south', stageSide: 'north' };
  const facing = resolveHeadFacing(venue);
  const headTable = plan.tables.find((t) => t.isHeadTable) ?? null;
  const secondary = plan.tables.find((t) => t.isSecondaryHead) ?? null;
  const selected = plan.tables.find((t) => t.id === selectedTableId) ?? null;

  const setVenue = (patch: Partial<Venue>) => {
    dispatch({ type: 'updateVenue', venue: { ...venue, ...patch } });
  };

  const headGroupIds = new Set<string>();
  for (const t of plan.tables) {
    if (t.isHeadTable || t.isSecondaryHead) headGroupIds.add(t.id);
  }
  const headGuestCount = collectHeadGuests(plan, headGroupIds).length;

  const handleArrange = () => {
    if (!headTable) {
      const result = arrangeHeadTable({ plan, targetTable: null, capacity: 10 });
      dispatch({ type: 'arrangeHeadTable', tables: result.tables, marks: result.marks, headTableId: result.headTableId });
      onHeadTableChange?.(result.headTableId);
      if (result.overflow > 0) {
        // 微任务提示，避免阻塞 React 状态更新
        setTimeout(() => alert(`主桌坐不下：还有 ${result.overflow} 人已自动安排到「${result.secondaryTable?.label ?? '副桌'}」，主位与朝向保持不变。`), 0);
      }
      return;
    }
    const result = arrangeHeadTable({ plan, targetTable: headTable, capacity: headTable.capacity });
    dispatch({ type: 'arrangeHeadTable', tables: result.tables, marks: result.marks, headTableId: result.headTableId });
    onHeadTableChange?.(result.headTableId);
    if (result.overflow > 0) {
      setTimeout(() => alert(`主桌坐不下：还有 ${result.overflow} 人已自动安排到「${result.secondaryTable?.label ?? '副桌'}」，主位与朝向保持不变。`), 0);
    }
  };

  const handleSwitch = () => {
    if (!selected || selected.isHeadTable) return;
    const capacity = Math.max(selected.capacity, 10);
    const result = switchHeadTable(plan, selected.id, capacity);
    dispatch({ type: 'switchHeadTable', tables: result.tables, marks: result.marks, headTableId: result.headTableId });
    onHeadTableChange?.(result.headTableId);
    if (result.overflow > 0) {
      setTimeout(() => alert(`换主桌后人多位紧：${result.overflow} 人安排在副桌，新主桌主位与朝向已按场地重定。`), 0);
    }
  };

  const groupCapacity = (headTable?.capacity ?? 0) + (secondary ? secondary.capacity : 0);
  const overflow = headTable ? Math.max(0, headGuestCount - groupCapacity) : 0;

  return (
    <div className="venue-bar">
      <div className="venue-group">
        <span className="venue-label">🚪 进门在</span>
        <div className="side-toggle">
          {SIDES.map((s) => (
            <button
              key={s.value}
              className={venue.entranceSide === s.value ? 'active' : ''}
              title={`进门在${s.label}侧`}
              onClick={() => setVenue({ entranceSide: s.value })}
            >
              <span className="side-arrow">{s.arrow}</span>{s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="venue-group">
        <span className="venue-label">🎤 舞台在</span>
        <div className="side-toggle">
          <button
            className={venue.stageSide === null ? 'active' : ''}
            onClick={() => setVenue({ stageSide: null })}
            title="无舞台"
          >
            无
          </button>
          {SIDES.map((s) => (
            <button
              key={s.value}
              className={venue.stageSide === s.value ? 'active' : ''}
              title={`舞台在${s.label}侧`}
              onClick={() => setVenue({ stageSide: s.value })}
            >
              <span className="side-arrow">{s.arrow}</span>{s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="venue-group facing-preview">
        <span className="venue-label">主位朝向</span>
        <b className="facing-dir" title="1 号主位朝向；新人面向此方向">
          {SIDES.find((s) => s.value === facing)?.arrow} 面向{facingLabel(facing)}
        </b>
        <span className="facing-rule">
          {venue.stageSide ? '（面向舞台）' : '（背对进门）'}
        </span>
      </div>

      <div className="venue-divider" />

      <div className="venue-group">
        <button className="btn-arrange" onClick={handleArrange}>
          {headTable ? '🔄 按规矩重排主桌' : '👑 设为主桌并排位'}
        </button>
        {selected && !selected.isHeadTable && (
          <button className="btn-switch" onClick={handleSwitch} title="把当前选中的桌换做主桌，宾客随主位整体重排">
            ⇄ 换用此桌为主桌
          </button>
        )}
        {headTable && (
          <span className="head-info">
            主桌 {headTable.label}（{headTable.capacity} 人位）{secondary ? ' · 已分副桌' : ''}
            {overflow > 0 && (
              <em className="overflow-warn"> ⚠ 候选 {headGuestCount} 人超出主桌组容量 {groupCapacity}，重排将自动分两桌（保主位、保朝向）</em>
            )}
          </span>
        )}
      </div>

      {plan.seatMarks && plan.seatMarks.length > 0 && (
        <button
          className="btn-clear-marks"
          onClick={() => dispatch({ type: 'clearSeatMarks' })}
          title="清除座位上的位次变动标记"
        >
          清除变动标记
        </button>
      )}
    </div>
  );
}
