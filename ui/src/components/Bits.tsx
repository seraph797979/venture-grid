// modules/venture-grid/ui/src/components/Bits.tsx
import type { ReactNode } from "react";
import { ApiError } from "../api/client";
import { t, tOptional } from "../i18n";
import type { Trend, VentureStatus } from "../../../domain/types";
import { trendClass, trendMark } from "../lib/format";

export function Spinner() {
  return <span className="spinner" aria-label="loading" />;
}

export function Section({
  title,
  count,
  actions,
  children,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="section-title">
        <h2>{title}</h2>
        {count !== undefined && <span className="count">{count}</span>}
        <span className="grow" />
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Empty({ text }: { text?: string }) {
  return <div className="muted small" style={{ padding: "10px 2px" }}>{text ?? t("common.empty")}</div>;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {hint !== undefined && <em className="muted" style={{ fontStyle: "normal", marginLeft: 6 }}>{hint}</em>}
      </span>
      {children}
    </label>
  );
}

export function Notice({
  kind = "info",
  children,
}: {
  kind?: "info" | "warn" | "error" | "ok";
  children: ReactNode;
}) {
  return <div className={`notice notice-${kind}`}>{children}</div>;
}

const STATUS_CLASS: Record<VentureStatus, string> = {
  active: "badge badge-active",
  suspended: "badge badge-suspended",
  closed: "badge badge-closed",
};

export function StatusBadge({ status }: { status: VentureStatus }) {
  return <span className={STATUS_CLASS[status]}>{t(`status.${status}`)}</span>;
}

export function TrendArrow({
  trend,
  score,
  className = "",
}: {
  trend: Trend;
  score?: number | null;
  className?: string;
}) {
  return (
    <span className={`flex ${className}`} style={{ gap: 6 }}>
      {score !== undefined && score !== null && <span className="mono" style={{ fontWeight: 700 }}>{Math.round(score)}</span>}
      <span className={`${trendClass(trend)}`} title={t(`trend.${trend}`)} style={{ fontFamily: "var(--mono)" }}>
        {trendMark(trend)}
      </span>
    </span>
  );
}

export function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap" style={{ gap: 4 }}>
      {tags.map((tag) => (
        <span key={tag} className="badge" style={{ fontWeight: 500 }}>{tag}</span>
      ))}
    </span>
  );
}

/** 把 ApiError.code 映射到 i18n 文案；未知码直接显示原文。 */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const mapped = tOptional(`errors.${error.code}`);
    if (mapped === null || mapped === `errors.${error.code}`) return error.message;
    return mapped === error.message ? mapped : `${mapped}（${error.message}）`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error === null || error === undefined) return null;
  return (
    <Notice kind="error">
      <div className="spread">
        <span>{errorMessage(error)}</span>
        {onRetry !== undefined && (
          <button type="button" className="btn btn-sm" onClick={onRetry}>
            {t("common.retry")}
          </button>
        )}
      </div>
    </Notice>
  );
}

export function Loading() {
  return (
    <div className="flex muted small" style={{ padding: 20 }}>
      <Spinner /> {t("common.loading")}
    </div>
  );
}