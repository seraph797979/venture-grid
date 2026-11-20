// modules/venture-grid/ui/src/pages/VenturePage.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type VentureDetail } from "../api/client";
import { useAuth } from "../auth";
import { Empty, ErrorNotice, Field, Notice, Section, Spinner, StatusBadge, TagList, TrendArrow, errorMessage } from "../components/Bits";
import { t } from "../i18n";
import { Link, navigate } from "../router";
import { formatDate, parseTags, trendMark } from "../lib/format";
import { DatasetPanel } from "../components/DatasetPanel";
import type { DatasetView } from "../../../domain/dataset";
import type { RelationType, Venture, VentureStatus } from "../../../domain/types";

const RELATIONS: RelationType[] = ["support", "contradict", "depend", "parallel"];

export function VenturePage({ id }: { id: string }) {
  const auth = useAuth();
  const canWrite = auth.status === "admin";
  const [detail, setDetail] = useState<VentureDetail | null>(null);
  const [datasets, setDatasets] = useState<DatasetView[]>([]);
  const [datasetError, setDatasetError] = useState<unknown>(null);
  const [datasetBusy, setDatasetBusy] = useState<string | null>(null);
  const [ventures, setVentures] = useState<Venture[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editHypothesis, setEditHypothesis] = useState("");
  const [editTags, setEditTags] = useState("");

  const [evidenceForm, setEvidenceForm] = useState({ sourceTitle: "", sourceUrl: "", rawText: "", tags: "" });
  const [scoreForm, setScoreForm] = useState({ score: "", comment: "", refs: [] as string[] });
  const [linkForm, setLinkForm] = useState<{ to: string; type: RelationType; note: string }>({
    to: "",
    type: "support",
    note: "",
  });
  const [forkTitle, setForkTitle] = useState("");

  const load = useCallback(async () => {
    try {
      const [nextDetail, list] = await Promise.all([api.venture(id), api.ventures()]);
      setDetail(nextDetail);
      setVentures(list.ventures);
      setError(null);
      setEditTitle(nextDetail.venture.title);
      setEditSummary(nextDetail.venture.summary);
      setEditHypothesis(nextDetail.venture.hypothesis);
      setEditTags(nextDetail.venture.tags.join(", "));
      setScoreForm((current) => ({
        ...current,
        score: current.score === "" ? String(nextDetail.latestScore?.score ?? 50) : current.score,
      }));
    } catch (reason) {
      setError(reason);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDatasets = useCallback(async () => {
    try {
      const result = await api.datasets(id);
      setDatasets(result.datasets);
      setDatasetError(null);
    } catch (reason) {
      setDatasetError(reason);
    }
  }, [id]);

  useEffect(() => {
    void loadDatasets();
  }, [loadDatasets]);

  const refreshDataset = async (datasetId: string): Promise<void> => {
    setDatasetBusy(datasetId);
    try {
      await api.refreshDataset(id, datasetId);
      await loadDatasets();
    } catch (reason) {
      setDatasetError(reason);
    } finally {
      setDatasetBusy(null);
    }
  };

  const otherVentures = useMemo(
    () => ventures.filter((venture) => venture.id !== id),
    [ventures, id],
  );

  const titleById = useMemo(() => new Map(ventures.map((venture) => [venture.id, venture.title])), [ventures]);

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    setBusy(key);
    setNotice(null);
    try {
      await action();
    } catch (reason) {
      setNotice(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  };

  if (error !== null && detail === null) {
    return (
      <div className="container">
        <ErrorNotice error={error} onRetry={() => void load()} />
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="container">
        <div className="flex muted small" style={{ padding: 30 }}><Spinner /> {t("common.loading")}</div>
      </div>
    );
  }

  const venture = detail.venture;

  const setStatus = (status: VentureStatus) =>
    run("status", async () => {
      await api.updateVenture(venture.id, { status });
      await load();
    });

  return (
    <div className="container">
      <div className="flex spread" style={{ marginBottom: 8 }}>
        <div className="flex small">
          <Link to="/">{t("nav.home")}</Link>
          <span className="muted">/</span>
          <Link to="/graph">{t("nav.graph")}</Link>
        </div>
        <a className="btn btn-sm" href={`/api/vg/export/venture/${encodeURIComponent(venture.id)}.md`} download>
          {t("venture.exportMd")}
        </a>
      </div>

      <div className="split">
        <div>
          <h1 style={{ marginBottom: 8 }}>{venture.title}</h1>
          <div className="flex flex-wrap" style={{ gap: 8, marginBottom: 12 }}>
            <StatusBadge status={venture.status} />
            <TagList tags={venture.tags} />
            {venture.forkOrigin !== null && (
              <span className="badge badge-generating">fork: {venture.forkOrigin}</span>
            )}
          </div>

          {notice !== null && <Notice kind="error">{notice}</Notice>}

          {auth.status !== "admin" && (
            <div className="notice notice-info" style={{ marginTop: 12 }}>
              {t("auth.loginToEdit")} · <Link to="/admin">{t("auth.login")}</Link>
            </div>
          )}

          <div className="flex flex-wrap" style={{ gap: 8, marginTop: 12 }} hidden={!canWrite}>
            {venture.status !== "active" ? (
              <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => void setStatus("active")}>
                {t("venture.reactivate")}
              </button>
            ) : (
              <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => void setStatus("suspended")}>
                {t("venture.dormant")}
              </button>
            )}
            {venture.status !== "closed" && (
              <button type="button" className="btn btn-sm btn-danger" disabled={busy !== null} onClick={() => void setStatus("closed")}>
                {t("venture.close")}
              </button>
            )}
            <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => setEditing((value) => !value)}>
              {t("common.edit")}
            </button>
          </div>

          {editing && canWrite && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="stack">
                <Field label={t("venture.title")}>
                  <input className="input" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
                </Field>
                <Field label={t("venture.summary")}>
                  <textarea className="textarea" value={editSummary} onChange={(event) => setEditSummary(event.target.value)} />
                </Field>
                <Field label={t("venture.hypothesis")}>
                  <textarea className="textarea textarea-lg" value={editHypothesis} onChange={(event) => setEditHypothesis(event.target.value)} />
                </Field>
                <Field label={t("venture.tags")} hint="comma separated">
                  <input className="input" value={editTags} onChange={(event) => setEditTags(event.target.value)} />
                </Field>
                <div className="flex">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy !== null}
                    onClick={() =>
                      void run("edit", async () => {
                        await api.updateVenture(venture.id, {
                          title: editTitle,
                          summary: editSummary,
                          hypothesis: editHypothesis,
                          tags: parseTags(editTags),
                        });
                        setEditing(false);
                        setNotice(t("venture.saved"));
                        await load();
                      })
                    }
                  >
                    {t("common.save")}
                  </button>
                  <button type="button" className="btn" onClick={() => setEditing(false)}>{t("common.cancel")}</button>
                </div>
              </div>
            </div>
          )}

          <Section title={t("venture.hypothesis")}>
            <div className="card card-flat small">{venture.hypothesis.trim() === "" ? t("common.none") : venture.hypothesis}</div>
          </Section>
          {venture.summary.trim() !== "" && (
            <Section title={t("venture.summary")}>
              <div className="card card-flat small">{venture.summary}</div>
            </Section>
          )}

          <Section title={t("venture.evidences")} count={detail.evidences.length}>
            <div className="stack">
              {detail.evidences.length === 0 ? (
                <Empty text={t("venture.noEvidence")} />
              ) : (
                <div className="list">
                  {detail.evidences.map((evidence) => (
                    <div key={evidence.id} className="list-item">
                      <div className="h">
                        <strong style={{ fontSize: 13 }}>{evidence.sourceTitle}</strong>
                        <span className="flex" style={{ gap: 6 }}>
                          <span className="badge">{evidence.abstractSource}</span>
                          <span className="tiny muted">{formatDate(evidence.addedAt)}</span>
                        </span>
                      </div>
                      <div className="body">{evidence.abstract}</div>
                      <div className="flex spread">
                        <TagList tags={evidence.tags} />
                        {evidence.sourceUrl !== null && (
                          <a className="tiny" href={evidence.sourceUrl} target="_blank" rel="noreferrer noopener">
                            {evidence.sourceUrl}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <details className="card card-flat" hidden={!canWrite}>
                <summary style={{ cursor: "pointer", fontWeight: 560 }}>{t("evidence.add")}</summary>
                <div className="stack" style={{ marginTop: 12 }}>
                  <div className="notice notice-info">{t("evidence.llmRequired")}</div>
                  <Field label={t("evidence.sourceTitle")}>
                    <input className="input" value={evidenceForm.sourceTitle} onChange={(event) => setEvidenceForm({ ...evidenceForm, sourceTitle: event.target.value })} />
                  </Field>
                  <Field label={t("evidence.sourceUrl")}>
                    <input className="input" value={evidenceForm.sourceUrl} onChange={(event) => setEvidenceForm({ ...evidenceForm, sourceUrl: event.target.value })} />
                  </Field>
                  <Field label={t("evidence.rawText")}>
                    <textarea className="textarea textarea-lg" value={evidenceForm.rawText} placeholder={t("evidence.rawPlaceholder")} onChange={(event) => setEvidenceForm({ ...evidenceForm, rawText: event.target.value })} />
                  </Field>
                  <Field label={t("evidence.tags")} hint="comma separated">
                    <input className="input" value={evidenceForm.tags} onChange={(event) => setEvidenceForm({ ...evidenceForm, tags: event.target.value })} />
                  </Field>
                  <div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy !== null}
                      onClick={() =>
                        void run("evidence", async () => {
                          await api.addEvidence(venture.id, {
                            sourceTitle: evidenceForm.sourceTitle,
                            sourceUrl: evidenceForm.sourceUrl === "" ? null : evidenceForm.sourceUrl,
                            rawText: evidenceForm.rawText,
                            tags: parseTags(evidenceForm.tags),
                          });
                          setEvidenceForm({ sourceTitle: "", sourceUrl: "", rawText: "", tags: "" });
                          setNotice(t("evidence.generated"));
                          await load();
                        })
                      }
                    >
                      {busy === "evidence" ? <><Spinner /> {t("common.submitting")}</> : t("evidence.add")}
                    </button>
                  </div>
                </div>
              </details>
            </div>
          </Section>

          {(datasets.length > 0 || datasetError !== null) && (
            <Section title={t("dataset.title")} count={datasets.length}>
              {datasetError !== null && (
                <ErrorNotice error={datasetError} onRetry={() => void loadDatasets()} />
              )}
              <DatasetPanel
                datasets={datasets}
                canWrite={canWrite}
                busyId={datasetBusy}
                onRefresh={(datasetId) => void refreshDataset(datasetId)}
              />
            </Section>
          )}

          <Section title={t("venture.scores")} count={detail.scores.length}>
            <div className="stack">
              {detail.scores.length === 0 ? (
                <Empty text={t("venture.noScore")} />
              ) : (
                <div className="card card-flat">
                  {detail.scores.map((score) => (
                    <div key={score.id} className="score-row">
                      <span className="tiny muted">{formatDate(score.createdAt)}</span>
                      <span className="s">{Math.round(score.score)}</span>
                      <span className={score.trend === "up" ? "trend-up" : score.trend === "down" ? "trend-down" : "trend-flat"}>
                        {trendMark(score.trend)}
                      </span>
                      <span className="small">
                        {score.comment}
                        <span className="muted tiny" style={{ marginLeft: 8 }}>
                          {score.evidenceRefs.length === 0 ? t("score.noRefs") : `${score.evidenceRefs.length} evidence`}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <details className="card card-flat" hidden={!canWrite}>
                <summary style={{ cursor: "pointer", fontWeight: 560 }}>{t("score.update")}</summary>
                <div className="stack" style={{ marginTop: 12 }}>
                  <div className="row">
                    <Field label={t("score.score")} hint="0–100">
                      <input className="input" type="number" min={0} max={100} value={scoreForm.score} onChange={(event) => setScoreForm({ ...scoreForm, score: event.target.value })} />
                    </Field>
                    <Field label={t("score.comment")}>
                      <input className="input" value={scoreForm.comment} onChange={(event) => setScoreForm({ ...scoreForm, comment: event.target.value })} />
                    </Field>
                  </div>
                  <Field label={t("score.refs")}>
                    <div className="stack-sm">
                      {detail.evidences.length === 0 ? (
                        <span className="muted small">{t("score.noRefs")}</span>
                      ) : (
                        detail.evidences.map((evidence) => (
                          <label key={evidence.id} className="flex small">
                            <input
                              type="checkbox"
                              checked={scoreForm.refs.includes(evidence.id)}
                              onChange={(event) => {
                                const next = event.target.checked
                                  ? [...scoreForm.refs, evidence.id]
                                  : scoreForm.refs.filter((ref) => ref !== evidence.id);
                                setScoreForm({ ...scoreForm, refs: next });
                              }}
                            />
                            {evidence.sourceTitle}
                          </label>
                        ))
                      )}
                    </div>
                  </Field>
                  {scoreForm.refs.length === 0 && <div className="notice notice-warn">{t("score.noEvidenceWarning")}</div>}
                  <div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy !== null}
                      onClick={() =>
                        void run("score", async () => {
                          await api.addScore(venture.id, {
                            score: Number(scoreForm.score),
                            comment: scoreForm.comment,
                            evidenceRefs: scoreForm.refs,
                          });
                          setScoreForm({ score: "", comment: "", refs: [] });
                          setNotice(t("score.update"));
                          await load();
                        })
                      }
                    >
                      {busy === "score" ? <><Spinner /> {t("common.submitting")}</> : t("score.update")}
                    </button>
                  </div>
                </div>
              </details>
            </div>
          </Section>

          <Section title={t("venture.links")} count={detail.links.length}>
            <div className="stack">
              {detail.links.length === 0 ? (
                <Empty text={t("venture.noLink")} />
              ) : (
                <div className="list">
                  {detail.links.map((link) => {
                    const isFrom = link.fromVentureId === venture.id;
                    const otherId = isFrom ? link.toVentureId : link.fromVentureId;
                    return (
                      <div key={link.id} className="list-item">
                        <div className="h">
                          <span className="small">
                            {isFrom ? "→" : "←"}{" "}
                            <Link to={`/venture/${otherId}`}>{titleById.get(otherId) ?? otherId}</Link>
                          </span>
                          <span className="badge">{t(`relation.${link.relationType}`)}</span>
                        </div>
                        {link.note !== null && link.note !== "" && <div className="body">{link.note}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
              <details className="card card-flat" hidden={!canWrite}>
                <summary style={{ cursor: "pointer", fontWeight: 560 }}>{t("link.add")}</summary>
                <div className="stack" style={{ marginTop: 12 }}>
                  <div className="row">
                    <Field label={t("link.to")}>
                      <select className="select" value={linkForm.to} onChange={(event) => setLinkForm({ ...linkForm, to: event.target.value })}>
                        <option value="">—</option>
                        {otherVentures.map((item) => (
                          <option key={item.id} value={item.id}>{item.title}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t("link.type")}>
                      <select className="select" value={linkForm.type} onChange={(event) => setLinkForm({ ...linkForm, type: event.target.value as RelationType })}>
                        {RELATIONS.map((relation) => (
                          <option key={relation} value={relation}>{t(`relation.${relation}`)}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label={t("link.note")}>
                    <input className="input" value={linkForm.note} onChange={(event) => setLinkForm({ ...linkForm, note: event.target.value })} />
                  </Field>
                  <div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy !== null || linkForm.to === ""}
                      onClick={() =>
                        void run("link", async () => {
                          await api.addLink({
                            fromVentureId: venture.id,
                            toVentureId: linkForm.to,
                            relationType: linkForm.type,
                            note: linkForm.note === "" ? null : linkForm.note,
                          });
                          setLinkForm({ to: "", type: "support", note: "" });
                          await load();
                        })
                      }
                    >
                      {t("link.add")}
                    </button>
                  </div>
                </div>
              </details>
            </div>
          </Section>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>{t("venture.detail")}</h3></div>
            <dl className="kv">
              <dt>{t("venture.latestScore")}</dt>
              <dd>
                {detail.latestScore === null ? (
                  <span className="muted">{t("venture.noScore")}</span>
                ) : (
                  <TrendArrow trend={detail.latestScore.trend} score={detail.latestScore.score} />
                )}
              </dd>
              <dt>{t("venture.parent")}</dt>
              <dd>
                {detail.parent === null ? (
                  <span className="muted">{t("venture.root")}</span>
                ) : (
                  <Link to={`/venture/${detail.parent.id}`}>{detail.parent.title}</Link>
                )}
              </dd>
              <dt>{t("venture.createdAt")}</dt>
              <dd className="small">{formatDate(venture.createdAt)}</dd>
              <dt>{t("venture.updatedAt")}</dt>
              <dd className="small">{formatDate(venture.updatedAt)}</dd>
              <dt>ID</dt>
              <dd className="mono break-all">{venture.id}</dd>
            </dl>
          </div>

          <div className="card">
            <div className="card-head"><h3>{t("venture.children")}</h3></div>
            {detail.children.length === 0 ? (
              <Empty text={t("venture.noChild")} />
            ) : (
              <div className="list">
                {detail.children.map((child) => (
                  <div key={child.id} className="list-item">
                    <div className="h">
                      <Link to={`/venture/${child.id}`} style={{ fontWeight: 560 }}>{child.title}</Link>
                      <StatusBadge status={child.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="divider" />
            <div className="stack-sm" hidden={!canWrite}>
              <Field label={t("venture.branch")}>
                <input className="input" value={forkTitle} onChange={(event) => setForkTitle(event.target.value)} placeholder={t("venture.title")} />
              </Field>
              <button
                type="button"
                className="btn"
                disabled={busy !== null || forkTitle.trim() === ""}
                onClick={() =>
                  void run("fork", async () => {
                    const created = await api.forkVenture(venture.id, { title: forkTitle.trim() });
                    setForkTitle("");
                    navigate(`/venture/${created.venture.id}`);
                  })
                }
              >
                {t("venture.branch")}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>{t("venture.scores")}</h3></div>
            {detail.scores.length === 0 ? (
              <Empty />
            ) : (
              <div className="stack-sm">
                {[...detail.scores].slice(-6).reverse().map((score) => (
                  <div key={score.id} className="flex spread small">
                    <span className="mono">{Math.round(score.score)}</span>
                    <span className={score.trend === "up" ? "trend-up" : score.trend === "down" ? "trend-down" : "trend-flat"}>
                      {trendMark(score.trend)}
                    </span>
                    <span className="muted tiny">{formatDate(score.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}