// modules/venture-grid/ui/src/pages/BriefPage.tsx
import { useCallback, useEffect, useState } from "react";
import { api, saveText, type BriefResponse } from "../api/client";
import { useAuth } from "../auth";
import { Empty, ErrorNotice, Field, Notice, Spinner, errorMessage } from "../components/Bits";
import { Markdown } from "../components/Markdown";
import { t } from "../i18n";
import { Link, useLocationString } from "../router";
import { formatDate } from "../lib/format";
import type { Batch } from "../../../domain/types";

const STATUS_CLASS: Record<string, string> = {
  ready: "badge badge-ready",
  failed: "badge badge-failed",
  generating: "badge badge-generating",
  pending: "badge badge-pending",
};

export function BriefPage() {
  const auth = useAuth();
  const canWrite = auth.status === "admin";
  const location = useLocationString();
  const queryBatch = new URLSearchParams(location.split("?")[1] ?? "").get("batch");

  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<string | null>(queryBatch);
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .batches()
      .then((value) => {
        setBatches(value.batches);
        if (selected === null) setSelected(value.batches[0]?.id ?? null);
      })
      .catch((reason: unknown) => setError(reason));
    // 只在挂载时取列表；批次切换由下方 effect 处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (id: string) => {
    try {
      const value = await api.brief(id);
      setBrief(value);
      setNote(value.batch.adminNote);
      setError(null);
    } catch (reason) {
      setError(reason);
      setBrief(null);
    }
  }, []);

  useEffect(() => {
    if (selected !== null) void load(selected);
  }, [selected, load]);

  const refresh = async (): Promise<void> => {
    if (selected === null) return;
    await load(selected);
    const list = await api.batches();
    setBatches(list.batches);
  };

  return (
    <div className="container">
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>{t("brief.title")}</h2>
        <span className="grow" />
        <label className="flex small">
          {t("brief.select")}
          <select className="select" style={{ width: 200 }} value={selected ?? ""} onChange={(event) => setSelected(event.target.value)}>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.name} · {batch.briefStatus}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error !== null && <ErrorNotice error={error} onRetry={() => selected !== null && void load(selected)} />}
      {notice !== null && <Notice kind="ok">{notice}</Notice>}
      {auth.status !== "admin" && (
        <Notice kind="info">
          {t("auth.loginToEdit")} · <Link to="/admin">{t("auth.login")}</Link>
        </Notice>
      )}

      {brief === null ? (
        <div className="flex muted small" style={{ padding: 20 }}><Spinner /> {t("common.loading")}</div>
      ) : (
        <div className="split">
          <div className="stack">
            <div className="card">
              <div className="spread" style={{ marginBottom: 8 }}>
                <div>
                  <h3 style={{ margin: 0 }}>{brief.batch.name}</h3>
                  <div className="muted tiny">
                    {formatDate(brief.batch.startTime)} — {formatDate(brief.batch.endTime)}
                  </div>
                </div>
                <span className={STATUS_CLASS[brief.batch.briefStatus] ?? "badge"}>
                  {t(`brief.${brief.batch.briefStatus}`)}
                </span>
              </div>

              <div className="stats" style={{ margin: "10px 0 0" }}>
                <div className="stat"><div className="n">{brief.counts.added}</div><div className="l">{t("brief.newVentures")}</div></div>
                <div className="stat"><div className="n">{brief.counts.scoreChanges}</div><div className="l">{t("brief.scoreChanges")}</div></div>
                <div className="stat"><div className="n">{brief.counts.evidences}</div><div className="l">{t("brief.newEvidences")}</div></div>
                <div className="stat"><div className="n">{brief.counts.links}</div><div className="l">{t("brief.newLinks")}</div></div>
              </div>

              <div className="flex flex-wrap" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  hidden={!canWrite}
                  disabled={busy !== null}
                  onClick={() =>
                    void (async () => {
                      setBusy("generate");
                      setNotice(null);
                      try {
                        await api.runWeekly(brief.batch.id);
                        setNotice(t("brief.ready"));
                        await refresh();
                      } catch (reason) {
                        setNotice(errorMessage(reason));
                        await refresh();
                      } finally {
                        setBusy(null);
                      }
                    })()
                  }
                >
                  {busy === "generate" ? <><Spinner /> {t("brief.generating")}</> : t("brief.generate")}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={brief.batch.briefStatus !== "ready"}
                  onClick={() => saveText(brief.batch.briefContent, `${brief.batch.name}.md`)}
                >
                  {t("brief.exportMd")}
                </button>
                <button
                  type="button"
                  className="btn"
                  hidden={!canWrite}
                  disabled={busy !== null}
                  onClick={() =>
                    void (async () => {
                      setBusy("note");
                      try {
                        await api.setBatchNote(brief.batch.id, note);
                        await refresh();
                        setNotice(t("common.save"));
                      } catch (reason) {
                        setNotice(errorMessage(reason));
                      } finally {
                        setBusy(null);
                      }
                    })()
                  }
                >
                  {t("brief.saveNote")}
                </button>
              </div>
            </div>

            {brief.batch.briefStatus === "ready" ? (
              <div className="card">
                <Markdown source={brief.batch.briefContent} />
              </div>
            ) : brief.batch.briefStatus === "failed" ? (
              <Notice kind="error">
                <strong>{t("brief.noBrief")}</strong>
                <div style={{ marginTop: 4 }}>{t("brief.error")}：{brief.batch.briefError ?? "—"}</div>
              </Notice>
            ) : brief.batch.briefStatus === "generating" ? (
              <Notice kind="info"><Spinner /> {t("brief.generating")}</Notice>
            ) : (
              <Notice kind="warn">
                {t("brief.pending")}
                <div style={{ marginTop: 4 }}>{t("brief.llmRequired")}</div>
              </Notice>
            )}
          </div>

          <div className="stack">
            <div className="card">
              <div className="card-head"><h3>{t("brief.adminNote")}</h3></div>
              <Field label={t("brief.adminNote")}>
                <textarea className="textarea textarea-lg" value={note} readOnly={!canWrite} onChange={(event) => setNote(event.target.value)} />
              </Field>
              <div className="muted tiny" style={{ marginTop: 6 }}>{t("brief.modelNote")}</div>
            </div>

            <div className="card">
              <div className="card-head"><h3>{t("brief.runs")}</h3></div>
              {brief.runs.length === 0 ? (
                <Empty />
              ) : (
                <div className="stack-sm">
                  {brief.runs.map((run) => (
                    <div key={run.id} className="flex spread small">
                      <span className={`badge ${run.status === "success" ? "badge-ready" : run.status === "failed" ? "badge-failed" : "badge-generating"}`}>
                        {run.status}
                      </span>
                      <span className="muted tiny">{formatDate(run.startedAt)}</span>
                      <span className="mono tiny">{run.finishedAt === null ? "…" : `${Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s`}</span>
                    </div>
                  ))}
                </div>
              )}
              {brief.runs.length > 0 && brief.runs[0]?.error !== null && (
                <div className="notice notice-error" style={{ marginTop: 8 }}>{brief.runs[0]?.error}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}