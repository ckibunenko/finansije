import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type TableRow = {
  id: string;
  dayNumber: number;
  dayLabel: string;
  amount: number | null;
  planned: number;
  difference: number | null;
  cumulativeSpent: number;
  cumulativeDifference: number;
  targetCumulativeSpent: number;
  state: 'neutral' | 'saved' | 'overspent';
};

type DonutSegment = {
  name: string;
  value: number;
  color: string;
};

type ChartsPanelProps = {
  activeMonthBudget: number;
  cumulativeActualCutoffDay: number;
  donutData: DonutSegment[];
  formatCurrency: (value: number | null | undefined) => string;
  theme: 'light' | 'dark';
  allRows: TableRow[];
  tableRows: TableRow[];
};

type TooltipContentProps = {
  active?: boolean;
  label?: string | number;
  payload?: Array<{
    color?: string;
    dataKey?: string | number;
    name?: string;
    value?: unknown;
  }>;
};

function ChartsPanel({
  activeMonthBudget,
  cumulativeActualCutoffDay,
  donutData,
  formatCurrency,
  theme,
  allRows,
  tableRows,
}: ChartsPanelProps) {
  const isDark = theme === 'dark';
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const axisColor = isDark ? '#94a3b8' : '#64748b';
  const tooltipStyle = {
    backgroundColor: isDark ? '#0f172a' : '#ffffff',
    border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
    borderRadius: '16px',
    color: isDark ? '#e2e8f0' : '#0f172a',
  };
  const renderBudgetTooltip = ({ active, payload }: TooltipContentProps) => {
    const item = payload?.[0];
    const numericValue = typeof item?.value === 'number' ? item.value : null;

    if (!active || !item || numericValue === null) {
      return null;
    }

    return (
      <div
        className="min-w-[180px] rounded-2xl border px-4 py-3 shadow-lg"
        style={tooltipStyle}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">
          Napredak budžeta
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: item.color ?? '#2563eb' }}
            aria-hidden="true"
          />
          <p className="text-sm font-medium">{item.name ?? 'Segment'}</p>
        </div>
        <p className="mt-2 text-lg font-semibold">{formatCurrency(numericValue)}</p>
      </div>
    );
  };
  const weekdayLabels = ['Pon', 'Uto', 'Sre', 'Cet', 'Pet', 'Sub', 'Ned'];
  const maxTrackedAmount = tableRows.length > 0 ? Math.max(...tableRows.map((row) => row.amount ?? 0)) : 0;
  const firstTrackedDay = tableRows.length > 0 ? tableRows[0].dayNumber : null;
  const parseRowDate = (dateString: string) => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };
  const firstRowDate = allRows.length > 0 ? parseRowDate(allRows[0].id) : null;
  const firstWeekdayOffset = firstRowDate ? (firstRowDate.getDay() + 6) % 7 : 0;
  const cumulativePlanRows = allRows.map((row) => ({
    ...row,
    cumulativeSpentVisible:
      firstTrackedDay !== null &&
      row.dayNumber >= firstTrackedDay &&
      row.dayNumber <= cumulativeActualCutoffDay
        ? row.cumulativeSpent
        : null,
  }));
  const heatmapTone = (row: TableRow) => {
    if (row.amount === null || maxTrackedAmount <= 0) {
      return {
        backgroundColor: isDark ? 'rgba(30, 41, 59, 0.72)' : 'rgba(241, 245, 249, 0.96)',
        borderColor: isDark ? 'rgba(71, 85, 105, 0.7)' : 'rgba(203, 213, 225, 0.9)',
        color: isDark ? '#94a3b8' : '#64748b',
      };
    }

    const intensity = Math.max(0.32, row.amount / maxTrackedAmount);

    if (row.state === 'saved') {
      return {
        backgroundColor: `rgba(16, 185, 129, ${Math.min(0.88, intensity)})`,
        borderColor: isDark ? 'rgba(110, 231, 183, 0.7)' : 'rgba(5, 150, 105, 0.55)',
        color: '#ecfdf5',
      };
    }

    return {
      backgroundColor: `rgba(239, 68, 68, ${Math.min(0.88, intensity)})`,
      borderColor: isDark ? 'rgba(253, 164, 175, 0.72)' : 'rgba(225, 29, 72, 0.55)',
      color: '#fff1f2',
    };
  };

  return (
    <>
      <article className="rounded-[28px] border border-white/60 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-[0_18px_50px_rgba(2,6,23,0.45)]">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-ink dark:text-white">Dnevna potrošnja kroz mesec</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Linijski odnos stvarnih troškova i planirane dnevne potrošnje.
          </p>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={tableRows}>
              <CartesianGrid stroke={gridColor} strokeDasharray="4 4" />
              <XAxis dataKey="dayNumber" tickLine={false} axisLine={false} tick={{ fill: axisColor }} />
              <YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} tick={{ fill: axisColor }} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: axisColor }} />
              <Line
                type="monotone"
                dataKey="amount"
                name="Stvarni trošak"
                stroke="#2563eb"
                strokeWidth={3}
                dot={{ r: 3 }}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="planned"
                name="Planirano"
                stroke="#64748b"
                strokeWidth={2}
                strokeDasharray="6 6"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="rounded-[28px] border border-white/60 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-[0_18px_50px_rgba(2,6,23,0.45)]">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-ink dark:text-white">Razlika po danima</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Pozitivna razlika znači uštedu, negativna razlika prekoračenje.
          </p>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tableRows}>
              <CartesianGrid stroke={gridColor} strokeDasharray="4 4" />
              <XAxis dataKey="dayNumber" tickLine={false} axisLine={false} tick={{ fill: axisColor }} />
              <YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} tick={{ fill: axisColor }} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={tooltipStyle} />
              <Bar dataKey="difference" name="Razlika">
                {tableRows.map((row) => (
                  <Cell
                    key={row.id}
                    fill={
                      row.difference === null
                        ? '#cbd5e1'
                        : row.difference >= 0
                          ? '#10b981'
                          : '#ef4444'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="rounded-[28px] border border-white/60 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-[0_18px_50px_rgba(2,6,23,0.45)]">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-ink dark:text-white">Kalendar potrošnje</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Ceo mesec na jednom mestu. Zeleno označava dane ispod plana, crveno dane iznad plana.
          </p>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-7 gap-2">
            {weekdayLabels.map((label) => (
              <div
                key={label}
                className="px-1 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500"
              >
                {label}
              </div>
            ))}
            {Array.from({ length: firstWeekdayOffset }, (_, index) => (
              <div key={`empty-${index}`} className="aspect-square rounded-2xl border border-dashed border-slate-200/80 dark:border-slate-700/80" />
            ))}
            {allRows.map((row) => {
              const tone = heatmapTone(row);
              const tooltipLabel =
                row.amount === null
                  ? `${row.dayLabel}: nema unosa`
                  : `${row.dayLabel}: ${formatCurrency(row.amount)} (${row.state === 'saved' ? 'ispod plana' : 'iznad plana'})`;

              return (
                <div
                  key={row.id}
                  title={tooltipLabel}
                  className="aspect-square rounded-[20px] border p-2 shadow-sm transition-transform hover:-translate-y-0.5"
                  style={tone}
                >
                  <div className="flex h-full flex-col justify-between">
                    <span className="text-xs font-semibold">{String(row.dayNumber).padStart(2, '0')}</span>
                    <span className="text-[10px] opacity-90">
                      {row.amount === null ? '—' : `${Math.round((row.amount ?? 0) / 1000)}k`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>Ispod plana</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-rose-500" aria-hidden="true" />
              <span>Iznad plana</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
              <span>Bez unosa</span>
            </div>
          </div>
        </div>
      </article>

      <article className="rounded-[28px] border border-white/60 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-[0_18px_50px_rgba(2,6,23,0.45)]">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-ink dark:text-white">Kumulativna ušteda / prekoračenje</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Linija pokazuje da li se mesec dugoročno kreće ka plusu ili minusu.
          </p>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={tableRows}>
              <CartesianGrid stroke={gridColor} strokeDasharray="4 4" />
              <XAxis dataKey="dayNumber" tickLine={false} axisLine={false} tick={{ fill: axisColor }} />
              <YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} tick={{ fill: axisColor }} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="cumulativeDifference"
                name="Kumulativno"
                stroke="#0f766e"
                strokeWidth={3}
                dot={{ r: 2.5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="rounded-[28px] border border-white/60 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-[0_18px_50px_rgba(2,6,23,0.45)]">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-ink dark:text-white">Kumulativno prema planu</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Poređenje stvarne kumulativne potrošnje sa idealnom putanjom planiranog budžeta.
          </p>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cumulativePlanRows}>
              <CartesianGrid stroke={gridColor} strokeDasharray="4 4" />
              <XAxis dataKey="dayNumber" tickLine={false} axisLine={false} tick={{ fill: axisColor }} />
              <YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} tick={{ fill: axisColor }} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: axisColor }} />
              <Line
                type="monotone"
                dataKey="cumulativeSpentVisible"
                name="Stvarno kumulativno"
                stroke="#f59e0b"
                strokeWidth={3}
                dot={{ r: 2.5 }}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="targetCumulativeSpent"
                name="Ciljna putanja"
                stroke="#475569"
                strokeWidth={2}
                strokeDasharray="6 6"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="rounded-[28px] border border-white/60 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-[0_18px_50px_rgba(2,6,23,0.45)]">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-ink dark:text-white">Napredak budžeta</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Donut pregled koliko je budžeta već potrošeno i koliko je ostalo.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={72}
                  outerRadius={102}
                  paddingAngle={2}
                >
                  {donutData.map((segment) => (
                    <Cell key={segment.name} fill={segment.color} />
                  ))}
                </Pie>
                <Tooltip content={renderBudgetTooltip} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            {donutData.map((segment) => (
              <div key={segment.name} className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: segment.color }}
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{segment.name}</p>
                </div>
                <p className="mt-2 text-lg font-semibold text-ink dark:text-white">{formatCurrency(segment.value)}</p>
              </div>
            ))}
            <div className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
              Planirani mesečni budžet:{' '}
              <span className="font-semibold text-ink dark:text-white">{formatCurrency(activeMonthBudget)}</span>
            </div>
          </div>
        </div>
      </article>
    </>
  );
}

export default ChartsPanel;
