// modules/venture-grid/domain/week.ts
/** ISO 周计算（UTC，避免服务器时区漂移影响批次边界）。 */

export type IsoWeekInfo = {
  /** 如 2026-W47 */
  key: string;
  name: string;
  startIso: string;
  endIso: string;
};

export function isoWeekInfo(date: Date): IsoWeekInfo {
  const base = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = base.getUTCDay() === 0 ? 7 : base.getUTCDay();
  // 移到本周四（ISO 周归属由周四所在年决定）
  base.setUTCDate(base.getUTCDate() + 4 - dayNum);
  const isoYear = base.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((base.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  const key = `${isoYear}-W${String(week).padStart(2, "0")}`;

  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = monday.getUTCDay() === 0 ? 7 : monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - (weekday - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);

  return {
    key,
    name: `Week ${key}`,
    startIso: monday.toISOString(),
    endIso: `${sunday.toISOString().slice(0, 10)}T23:59:59.999Z`,
  };
}