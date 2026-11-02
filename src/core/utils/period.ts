/**
 * Rent periods are stored as integers YYYYMM (e.g. 202611) so they sort,
 * index and compare correctly. Month names exist only at the API boundary.
 * All "current month" logic uses India Standard Time, not server locale.
 */
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
export type MonthName = (typeof MONTH_NAMES)[number];

export const BUSINESS_TIMEZONE = "Asia/Kolkata";

export interface ZonedDateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

export const zonedParts = (
  date: Date = new Date(),
  timeZone = BUSINESS_TIMEZONE,
): ZonedDateParts => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return { year: get("year"), month: get("month"), day: get("day") };
};

export const toPeriod = (year: number, month: number): number =>
  year * 100 + month;

export const periodYear = (period: number): number => Math.floor(period / 100);
export const periodMonth = (period: number): number => period % 100;

export const currentPeriod = (now: Date = new Date()): number => {
  const { year, month } = zonedParts(now);
  return toPeriod(year, month);
};

export const monthNumberFromName = (name: string): number | null => {
  const prefix = name.trim().slice(0, 3).toLowerCase();
  const idx = MONTH_NAMES.findIndex(
    (m) => m.slice(0, 3).toLowerCase() === prefix,
  );
  return idx === -1 ? null : idx + 1;
};

export const monthName = (month: number): MonthName =>
  MONTH_NAMES[Math.min(Math.max(month, 1), 12) - 1] as MonthName;

export const periodLabel = (period: number): string =>
  `${monthName(periodMonth(period))} ${periodYear(period)}`;
