export type WeeklyActivityDay = {
  date: string;
  completed: number;
  localDate: Date;
};

export type WeeklyActivityData = {
  days: WeeklyActivityDay[];
  total: number;
  historyNotice: string;
};

export function parseWeeklyActivity(value: unknown): WeeklyActivityData;
