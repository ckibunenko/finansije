export type DayEntry = {
  date: string;
  amount: number | null;
};

export type MonthBudget = {
  id: string;
  year: number;
  month: number;
  plannedMonthlyBudget: number;
  monthlySavingsGoal: number;
  entries: DayEntry[];
};

export type MonthBudgetMap = Record<string, MonthBudget>;
