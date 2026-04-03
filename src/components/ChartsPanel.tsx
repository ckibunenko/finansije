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
  amount: number | null;
  planned: number;
  difference: number | null;
  cumulativeDifference: number;
};

type DonutSegment = {
  name: string;
  value: number;
  color: string;
};

type ChartsPanelProps = {
  activeMonthBudget: number;
  donutData: DonutSegment[];
  formatCurrency: (value: number | null | undefined) => string;
  theme: 'light' | 'dark';
  tableRows: TableRow[];
};

function ChartsPanel({
  activeMonthBudget,
  donutData,
  formatCurrency,
  theme,
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
                <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={tooltipStyle} />
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
