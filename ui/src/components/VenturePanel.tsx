// modules/venture-grid/ui/src/components/VenturePanel.tsx
import { useEffect, useState } from "react";
import { api, type VentureDetail } from "../api/client";
import { t } from "../i18n";
import { Link } from "../router";
import { formatDate } from "../lib/format";
import { Empty, ErrorNotice, Loading, StatusBadge, TagList, TrendArrow } from "./Bits";

export function VenturePanel({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<VentureDetail | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setError(null);
    api
      .venture(id)
      .then((value) => {
        if (alive) setDetail(value);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="panel-overlay" onClick={onClose} />
      <aside className="panel" role="dialog" aria-label={t("venture.detail")}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <span className="muted small mono break-all">{id}</span>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        {error !== null && <ErrorNotice error={error} />}
        {detail === null && error === null && <Loading />}

        {detail !== null && (
          <div className="stack">
            <div>
              <h2 style={{ marginBottom: 6 }}>{detail.venture.title}</h2>
              <div className="flex flex-wrap" style={{ gap: 8 }}>
                <StatusBadge status={detail.venture.status} />
                <TagList tags={detail.venture.tags} />
              </div>
            </div>

            <div className="flex" style={{ gap: 18 }}>
              <div>
                <div className="muted tiny">{t("venture.latestScore")}</div>
                {detail.latestScore === null ? (
                  <span className="muted small">{t("venture.noScore")}</span>
                ) : (
                  <TrendArrow trend={detail.latestScore.trend} score={detail.latestScore.score} />
                )}
              </div>
              <div>
                <div className="muted tiny">{t("venture.evidences")}</div>
                <div className="mono">{detail.evidences.length}</div>
              </div>
              <div>
                <div className="muted tiny">{t("venture.scores")}</div>
                <div className="mono">{detail.scores.length}</div>
              </div>
              <div>
                <div className="muted tiny">{t("venture.links")}</div>
                <div className="mono">{detail.links.length}</div>
              </div>
            </div>

            {detail.venture.summary !== "" && <div className="small">{detail.venture.summary}</div>}
            {detail.venture.hypothesis !== "" && (
              <div>
                <div className="muted tiny" style={{ marginBottom: 4 }}>{t("venture.hypothesis")}</div>
                <div className="small" style={{ maxHeight: 180, overflow: "auto" }}>{detail.venture.hypothesis}</div>
              </div>
            )}

            {detail.parent !== null && (
              <div className="small">
                {t("venture.parent")}：<Link to={`/venture/${detail.parent.id}`}>{detail.parent.title}</Link>
              </div>
            )}

            <div>
              <div className="muted tiny" style={{ marginBottom: 4 }}>{t("venture.evidences")}</div>
              {detail.evidences.length === 0 ? (
                <Empty text={t("venture.noEvidence")} />
              ) : (
                <div className="list">
                  {detail.evidences.slice(0, 4).map((evidence) => (
                    <div key={evidence.id} className="list-item">
                      <div className="h">
                        <strong style={{ fontSize: 12.5 }}>{evidence.sourceTitle}</strong>
                        <span className="tiny muted">{formatDate(evidence.addedAt)}</span>
                      </div>
                      <div className="body">{evidence.abstract}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="muted tiny">{t("venture.createdAt")}：{formatDate(detail.venture.createdAt)}</div>

            <Link to={`/venture/${detail.venture.id}`} className="btn btn-primary" onClick={onClose}>
              {t("venture.openDetail")}
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}