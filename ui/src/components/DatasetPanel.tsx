// modules/venture-grid/ui/src/components/DatasetPanel.tsx
/** 公开数据源面板：NASA Exoplanet Archive 候选行星与宿主恒星参数。 */
import type { DatasetView } from "../../../domain/dataset";
import { t } from "../i18n";
import { formatDate } from "../lib/format";
import { Empty, Notice, Spinner } from "./Bits";

/** 与 datasource/exoplanet.ts 保持一致的公开来源地址（前端不跨目录引用服务端代码）。 */
const EXOPLANET_SOURCE_URL = "https://exoplanetarchive.ipac.caltech.edu/";

function fmt(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function DatasetPanel({
  datasets,
  canWrite,
  busyId,
  onRefresh,
}: {
  datasets: DatasetView[];
  canWrite: boolean;
  busyId: string | null;
  onRefresh: (datasetId: string) => void;
}) {
  if (datasets.length === 0) return null;

  return (
    <div className="stack">
      {datasets.map((dataset) => (
        <div key={dataset.id} className="card card-flat">
          <div className="spread" style={{ alignItems: "flex-start", marginBottom: 6 }}>
            <div>
              <h3 style={{ margin: 0 }}>{dataset.label}</h3>
              <div className="flex flex-wrap" style={{ gap: 6, marginTop: 6 }}>
                <span className="badge">{dataset.provider}</span>
                <span className="badge">
                  R ≤ {dataset.config.maxRadius} R⊕
                </span>
                <span className="badge">
                  Teq {dataset.config.tempMin}–{dataset.config.tempMax} K
                </span>
                <span className="badge">N ≤ {dataset.config.limit}</span>
                <span className="muted tiny">
                  {dataset.fetchedAt === null
                    ? t("dataset.notFetched")
                    : `${t("dataset.fetchedAt")}：${formatDate(dataset.fetchedAt)}`}
                </span>
              </div>
            </div>
            {canWrite && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={busyId !== null}
                onClick={() => onRefresh(dataset.id)}
              >
                {busyId === dataset.id ? <><Spinner /> {t("dataset.refreshing")}</> : t("dataset.refresh")}
              </button>
            )}
          </div>

          {dataset.stale && (
            <Notice kind="warn">{t("dataset.stale")}</Notice>
          )}
          {dataset.error !== null && !dataset.stale && (
            <Notice kind="error">
              {t("dataset.error")}：{dataset.error}
            </Notice>
          )}

          {dataset.rows.length === 0 ? (
            <Empty text={t("dataset.empty")} />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("dataset.columns.planet")}</th>
                    <th>{t("dataset.columns.host")}</th>
                    <th className="num">{t("dataset.columns.discYear")}</th>
                    <th className="num">{t("dataset.columns.radius")}</th>
                    <th className="num">{t("dataset.columns.eqTemp")}</th>
                    <th className="num">{t("dataset.columns.period")}</th>
                    <th className="num">{t("dataset.columns.distance")}</th>
                    <th className="num">{t("dataset.columns.teff")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dataset.rows.map((row) => (
                    <tr key={`${row.host}:${row.name}`}>
                      <td><strong>{row.name}</strong></td>
                      <td>{row.host === "" ? "—" : row.host}</td>
                      <td className="num">{row.discYear === null ? "—" : String(row.discYear)}</td>
                      <td className="num">{fmt(row.radius)}</td>
                      <td className="num">{fmt(row.eqTemp, 0)}</td>
                      <td className="num">{fmt(row.orbitalPeriod)}</td>
                      <td className="num">{fmt(row.distancePc, 1)}</td>
                      <td className="num">{fmt(row.starTeff, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="muted tiny" style={{ marginTop: 8 }}>
            {t("dataset.source")}：{" "}
            <a href={EXOPLANET_SOURCE_URL} target="_blank" rel="noreferrer noopener">
              NASA Exoplanet Archive
            </a>{" "}
            · {t("dataset.sourceHint")}
          </div>
        </div>
      ))}
    </div>
  );
}