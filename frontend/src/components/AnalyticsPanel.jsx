import { useMemo } from "react";

const LEVELS = ["#1e1b2e", "#2d1f5e", "#4c2889", "#7c3aed", "#a78bfa"];

function intensityLevel(count, max) {
  if (count === 0) return 0;
  if (max <= 0) return 1;
  const r = count / max;
  if (r <= 0.25) return 1;
  if (r <= 0.5) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

export default function AnalyticsPanel({ analytics, onExport }) {
  const { todayCount, totalReviews, streak, accuracy, heatMap, forecast } =
    analytics;

  const { grid, maxCount, weeks } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const dayMs = 86_400_000;

    const todayDow = (today.getDay() + 6) % 7; // Monday = 0
    const totalDays = 15 * 7 + todayDow + 1;
    const startMs = todayMs - (totalDays - 1) * dayMs;

    let max = 0;
    const cells = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startMs + i * dayMs);
      const key = d.toISOString().slice(0, 10);
      const count = heatMap[key] || 0;
      if (count > max) max = count;
      cells.push({ date: key, count });
    }

    return { grid: cells, maxCount: max, weeks: Math.ceil(totalDays / 7) };
  }, [heatMap]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { value: todayCount, label: "Today", color: "text-violet-400" },
          { value: `${streak}d`, label: "Streak", color: "text-amber-400" },
          {
            value: `${accuracy}%`,
            label: "Accuracy",
            color: "text-emerald-400",
          },
        ].map(({ value, label, color }) => (
          <div key={label} className="glass rounded-xl p-3 text-center">
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-slate-400">
          Activity — last 16 weeks
        </p>
        <div className="overflow-x-auto pb-2">
          <div
            className="grid gap-[3px]"
            style={{
              gridTemplateColumns: `repeat(${weeks}, 14px)`,
              gridTemplateRows: "repeat(7, 14px)",
              gridAutoFlow: "column",
            }}
          >
            {grid.map(({ date, count }) => (
              <div
                key={date}
                className="rounded-sm"
                style={{
                  background: LEVELS[intensityLevel(count, maxCount)],
                }}
                title={`${date}: ${count} review${count !== 1 ? "s" : ""}`}
              />
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-500">
          <span>Less</span>
          {LEVELS.map((c, i) => (
            <div
              key={i}
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: c }}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-slate-400">Forecast</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: forecast.dueNow, label: "Due now" },
            { value: forecast.byTomorrow, label: "By tomorrow" },
            { value: forecast.byWeek, label: "This week" },
          ].map(({ value, label }) => (
            <div key={label} className="glass rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-white">{value}</p>
              <p className="text-[10px] text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/5 pt-4">
        <p className="text-xs text-slate-500">{totalReviews} total reviews</p>
        <div className="flex gap-2">
          <button
            onClick={() => onExport("json")}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            JSON
          </button>
          <button
            onClick={() => onExport("csv")}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            CSV
          </button>
        </div>
      </div>
    </div>
  );
}
