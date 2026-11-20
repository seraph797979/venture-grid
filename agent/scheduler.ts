// modules/venture-grid/agent/scheduler.ts
/**
 * 可选的每周定时触发。默认关闭（VG_WEEKLY_DAY / VG_WEEKLY_AT 不设即不启用）。
 * 生产更推荐用外部 cron 调 `run.ts run-weekly`；这里只做“单进程内自足”的兜底。
 */
import { isoWeekInfo } from "../domain/week";
import type { VgService } from "../services/vg-service";
import { runWeeklyJob, type WeeklyJobResult } from "./weekly-job";

export type SchedulerOptions = {
  /** 0=周日 … 6=周六，默认 1（周一） */
  day?: number;
  /** HH:mm（本地时间），默认 09:00 */
  at?: string;
  service: VgService;
  onResult?: (result: WeeklyJobResult) => void;
  onError?: (error: unknown) => void;
};

export function parseWeeklySchedule(
  env: Record<string, string | undefined> = process.env,
): { day: number; at: string } | null {
  const at = (env.VG_WEEKLY_AT ?? "").trim();
  if (at === "") return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) return null;
  const rawDay = (env.VG_WEEKLY_DAY ?? "1").trim();
  const day = Number.parseInt(rawDay, 10);
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;
  return { day, at };
}

/** 启一个 60s tick；同一 ISO 周内最多触发一次成功生成。 */
export function startWeeklyScheduler(options: SchedulerOptions): () => void {
  const day = options.day ?? 1;
  const at = options.at ?? "09:00";
  const [hh, mm] = at.split(":").map((part) => Number.parseInt(part, 10));
  const doneWeeks = new Set<string>();
  let busy = false;

  const tick = async (): Promise<void> => {
    if (busy) return;
    const now = new Date();
    if (now.getDay() !== day || now.getHours() !== hh || now.getMinutes() !== mm) return;
    const week = isoWeekInfo(now).key;
    if (doneWeeks.has(week)) return;
    busy = true;
    try {
      const batch = options.service.ensureCurrentBatch();
      if (batch.briefStatus === "ready") {
        doneWeeks.add(week);
        return;
      }
      const result = await runWeeklyJob(options.service, { batchId: batch.id });
      if (result.status === "success") doneWeeks.add(week);
      options.onResult?.(result);
    } catch (error) {
      options.onError?.(error);
    } finally {
      busy = false;
    }
  };

  const timer = setInterval(() => void tick(), 60_000);
  return () => clearInterval(timer);
}