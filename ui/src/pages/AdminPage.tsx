// modules/venture-grid/ui/src/pages/AdminPage.tsx
/**
 * 管理页：**登录门禁**在这里。
 * - 未登录只渲染登录表单，管理控制台（批次/快照/文档/模型记录）完全不渲染
 * - 登录状态由 /api/vg/admin/check 验证；令牌失效会自动清掉
 * - 写权限仍由服务端强制校验（UI 门禁只是第一层）
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, downloadWithToken, getToken, type StateResponse } from "../api/client";
import { login, logout, useAuth } from "../auth";
import { Empty, ErrorNotice, Field, Loading, Notice, Spinner, errorMessage } from "../components/Bits";
import { t } from "../i18n";
import { formatDate, parseTags } from "../lib/format";
import { navigate } from "../router";
import type { Batch, DocumentKind, Venture, VentureProposal, VgDocument } from "../../../domain/types";

const DOC_KINDS: DocumentKind[] = ["guide", "glossary", "evidence_source", "brief_archive"];

type EmailLogView = {
  id: string;
  proposalId: string | null;
  toEmail: string;
  subject: string;
  status: "sent" | "failed";
  provider: string;
  error: string | null;
  at: string;
};

/* ==================== 登录视图 ==================== */

function LoginView() {
  const auth = useAuth();
  const [value, setValue] = useState(getToken());
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    await login(value);
    setBusy(false);
  };

  const message =
    auth.errorCode === "admin_not_configured"
      ? t("auth.serverNotConfigured")
      : auth.errorCode === "validation"
        ? t("auth.empty")
        : auth.errorCode !== null
          ? `${t("auth.invalid")}${auth.errorMessage ? `（${auth.errorMessage}）` : ""}`
          : null;

  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <h2>{t("auth.loginTitle")}</h2>
      <form className="card stack" onSubmit={(event) => void submit(event)}>
        <p className="muted small" style={{ margin: 0 }}>{t("auth.loginHint")}</p>
        <Field label={t("admin.token")}>
          <input
            className="input"
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t("auth.tokenPlaceholder")}
            autoComplete="off"
            autoFocus
          />
        </Field>
        {message !== null && <Notice kind="error">{message}</Notice>}
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <><Spinner /> {t("auth.checking")}</> : t("auth.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ==================== 文档编辑卡 ==================== */

function DocEditor({ document, onSaved }: { document: VgDocument; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(document.title);
  const [body, setBody] = useState(document.bodyMd);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <details className="card card-flat">
      <summary style={{ cursor: "pointer", fontSize: 13 }}>
        <strong>{document.title}</strong>
        <span className="badge" style={{ marginLeft: 8 }}>{t(`docs.kinds.${document.kind}`)}</span>
        <span className="mono tiny muted" style={{ marginLeft: 8 }}>{document.slug}</span>
      </summary>
      <div className="stack" style={{ marginTop: 10 }}>
        <Field label={t("venture.title")}>
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label={t("docs.body")}>
          <textarea className="textarea textarea-lg" value={body} onChange={(event) => setBody(event.target.value)} />
        </Field>
        <div className="flex">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                setMessage(null);
                try {
                  await api.updateDocument(document.id, { title, bodyMd: body });
                  await onSaved();
                  setMessage(t("common.save"));
                } catch (reason) {
                  setMessage(errorMessage(reason));
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            {busy ? <><Spinner /> {t("common.saving")}</> : t("common.save")}
          </button>
          {message !== null && <span className="muted small">{message}</span>}
        </div>
      </div>
    </details>
  );
}

/* ==================== 访客提案卡 ==================== */

function ProposalCard({
  proposal,
  emailLog,
}: {
  proposal: VentureProposal;
  emailLog?: { status: "sent" | "failed"; provider: string; error: string | null; at: string };
}) {
  const pending = proposal.status === "pending";

  return (
    <div className="list-item">
      <div className="h">
        <strong style={{ fontSize: 13 }}>{proposal.title}</strong>
        <span className="flex" style={{ gap: 6 }}>
          <span className={`badge ${pending ? "badge-pending" : proposal.status === "accepted" ? "badge-ready" : "badge-failed"}`}>
            {t(`admin.${proposal.status}`)}
          </span>
          <span className="tiny muted">{formatDate(proposal.createdAt)}</span>
        </span>
      </div>
      {proposal.summary !== "" && <div className="body">{proposal.summary}</div>}
      <div className="tiny muted">
        {t("admin.submitter")}：{proposal.submitter ?? "—"} · <span className="mono">{proposal.id}</span>
      </div>

      <details>
        <summary className="small" style={{ cursor: "pointer" }}>{t("submit.hypothesis")}</summary>
        <div className="small" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{proposal.hypothesis}</div>
        {proposal.referencesText !== "" && (
          <div className="small muted" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
            {proposal.referencesText}
          </div>
        )}
        {proposal.tags.length > 0 && (
          <div className="flex" style={{ gap: 4, marginTop: 8 }}>
            {proposal.tags.map((tag) => <span key={tag} className="badge">{tag}</span>)}
          </div>
        )}
      </details>

      {!pending && (
        <div className="small muted">
          {t("admin.processedAt")}：{formatDate(proposal.reviewedAt)}
          {proposal.reviewNote ? ` · ${proposal.reviewNote}` : ""}
          {proposal.ventureId !== null && (
            <> · <a href={`/venture/${proposal.ventureId}`}>{t("admin.proposalAccepted")}</a></>
          )}
        </div>
      )}

      {pending && (
        <div className="small muted" style={{ marginTop: 6 }}>{t("admin.aiPending")}</div>
      )}

      {emailLog !== undefined && (
        <div className="tiny muted">
          {t("admin.emailStatus")}：{emailLog.status === "sent" ? t("admin.emailSent") : t("admin.emailFailed")}
          {" · "}{emailLog.provider}
          {emailLog.error !== null ? ` · ${emailLog.error}` : ""}
          {" · "}{formatDate(emailLog.at)}
        </div>
      )}
    </div>
  );
}

/* ==================== 管理控制台 ==================== */

function AdminConsole() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [ventures, setVentures] = useState<Venture[]>([]);
  const [documents, setDocuments] = useState<VgDocument[]>([]);
  const [proposals, setProposals] = useState<VentureProposal[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLogView[]>([]);
  const [calls, setCalls] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [batchForm, setBatchForm] = useState({
    name: "",
    start: new Date().toISOString().slice(0, 16),
    end: new Date().toISOString().slice(0, 16),
  });
  const [ventureForm, setVentureForm] = useState({
    title: "",
    summary: "",
    hypothesis: "",
    tags: "",
    parentId: "",
  });
  const [docForm, setDocForm] = useState({
    slug: "",
    title: "",
    kind: "guide" as DocumentKind,
    bodyMd: "",
  });
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextState, batchList, docList, callList, ventureList, proposalList] = await Promise.all([
        api.state(),
        api.batches(),
        api.documents(),
        api.llmCalls(20).catch(() => ({ calls: [] })),
        api.ventures(),
        api.proposals(),
      ]);
      setState(nextState);
      setBatches(batchList.batches);
      setDocuments(docList.documents);
      setCalls(callList.calls);
      setVentures(ventureList.ventures);
      setProposals(proposalList.proposals);
      setEmailLogs(proposalList.emailLogs);
      setError(null);
    } catch (reason) {
      setError(reason);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const withBusy = async (key: string, action: () => Promise<void>): Promise<void> => {
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

  return (
    <div className="container">
      <div className="spread" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{t("admin.title")}</h2>
        <span className="flex" style={{ gap: 8 }}>
          <span className="badge badge-ready">{t("auth.loggedIn")}</span>
          <button type="button" className="btn btn-sm" onClick={logout}>
            {t("auth.logout")}
          </button>
        </span>
      </div>

      {error !== null && <ErrorNotice error={error} onRetry={() => void load()} />}
      {notice !== null && <Notice kind="error">{notice}</Notice>}

      <div className="stack" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="card-head"><h3>{t("admin.llm")}</h3></div>
          {state === null ? (
            <span className="muted small">{t("common.loading")}</span>
          ) : (
            <dl className="kv">
              <dt>{t("admin.status")}</dt>
              <dd>
                <span className={`badge ${state.llm.configured ? "badge-ready" : "badge-failed"}`}>
                  {state.llm.configured ? t("admin.llmOn") : t("admin.llmOff")}
                </span>
              </dd>
              <dt>provider</dt>
              <dd className="mono">{state.llm.provider ?? "—"}</dd>
              <dt>model</dt>
              <dd className="mono break-all">{state.llm.model ?? "—"}</dd>
              <dt>hint</dt>
              <dd className="small">{state.llm.hint}</dd>
              <dt>{t("admin.emailStatus")}</dt>
              <dd className="flex" style={{ gap: 8 }}>
                <span className={`badge ${state.email.configured ? "badge-ready" : "badge-failed"}`}>
                  {state.email.configured ? t("admin.llmOn") : t("admin.llmOff")}
                </span>
                <span className="mono small">{state.email.provider ?? "—"}</span>
              </dd>
              <dt>email hint</dt>
              <dd className="small">{state.email.hint}</dd>
            </dl>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>{t("admin.proposals")}</h3>
            <span className="badge">
              {proposals.filter((proposal) => proposal.status === "pending").length} {t("admin.pending")}
            </span>
          </div>
          {proposals.length === 0 ? (
            <Empty text={t("admin.noProposals")} />
          ) : (
            <div className="stack-sm">
              {proposals.map((proposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} emailLog={emailLogs.find((log) => log.proposalId === proposal.id)} />
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>{t("admin.emailLogs")}</h3></div>
          {emailLogs.length === 0 ? (
            <Empty />
          ) : (
            <div className="stack-sm">
              {emailLogs.slice(0, 12).map((log) => (
                <div key={log.id} className="flex spread small">
                  <span className={`badge ${log.status === "sent" ? "badge-ready" : "badge-failed"}`}>
                    {log.status === "sent" ? t("admin.emailSent") : t("admin.emailFailed")}
                  </span>
                  <span className="mono tiny">{log.toEmail}</span>
                  <span className="muted tiny">{log.provider}</span>
                  <span className="muted tiny">{formatDate(log.at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>{t("venture.new")}</h3></div>
          <div className="stack-sm">
            <div className="row">
              <Field label={t("venture.title")}>
                <input className="input" value={ventureForm.title} onChange={(event) => setVentureForm({ ...ventureForm, title: event.target.value })} />
              </Field>
              <Field label={t("venture.parent")}>
                <select className="select" value={ventureForm.parentId} onChange={(event) => setVentureForm({ ...ventureForm, parentId: event.target.value })}>
                  <option value="">{t("venture.root")}</option>
                  {ventures.map((venture) => (
                    <option key={venture.id} value={venture.id}>{venture.title}</option>
                  ))}
                </select>
              </Field>
              <Field label={t("venture.tags")} hint="comma separated">
                <input className="input" value={ventureForm.tags} onChange={(event) => setVentureForm({ ...ventureForm, tags: event.target.value })} />
              </Field>
            </div>
            <Field label={t("venture.summary")}>
              <input className="input" value={ventureForm.summary} onChange={(event) => setVentureForm({ ...ventureForm, summary: event.target.value })} />
            </Field>
            <Field label={t("venture.hypothesis")}>
              <textarea className="textarea" value={ventureForm.hypothesis} onChange={(event) => setVentureForm({ ...ventureForm, hypothesis: event.target.value })} />
            </Field>
            <div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null || ventureForm.title.trim() === ""}
                onClick={() =>
                  void withBusy("createVenture", async () => {
                    const created = await api.createVenture({
                      title: ventureForm.title.trim(),
                      summary: ventureForm.summary,
                      hypothesis: ventureForm.hypothesis,
                      parentId: ventureForm.parentId === "" ? null : ventureForm.parentId,
                      tags: parseTags(ventureForm.tags),
                    });
                    setVentureForm({ title: "", summary: "", hypothesis: "", tags: "", parentId: "" });
                    await load();
                    navigate(`/venture/${created.venture.id}`);
                  })
                }
              >
                {busy === "createVenture" ? <><Spinner /> {t("common.submitting")}</> : t("common.create")}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>{t("admin.batches")}</h3>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy !== null}
              onClick={() => void withBusy("current", async () => { await api.ensureCurrentBatch(); await load(); })}
            >
              {t("stats.currentBatch")}
            </button>
          </div>
          {batches.length === 0 ? (
            <Empty />
          ) : (
            <div className="list">
              {batches.map((batch) => (
                <div key={batch.id} className="list-item">
                  <div className="h">
                    <strong style={{ fontSize: 13 }}>{batch.name}</strong>
                    <span className="flex" style={{ gap: 6 }}>
                      <span className={`badge ${batch.status === "open" ? "badge-active" : "badge-closed"}`}>{batch.status}</span>
                      <span className={`badge badge-${batch.briefStatus === "ready" ? "ready" : batch.briefStatus === "failed" ? "failed" : batch.briefStatus === "generating" ? "generating" : "pending"}`}>
                        {t(`brief.${batch.briefStatus}`)}
                      </span>
                    </span>
                  </div>
                  <div className="flex spread">
                    <span className="tiny muted">{formatDate(batch.startTime)} — {formatDate(batch.endTime)}</span>
                    <span className="flex" style={{ gap: 6 }}>
                      {batch.status === "open" && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={busy !== null}
                          onClick={() => void withBusy(`close:${batch.id}`, async () => { await api.closeBatch(batch.id); await load(); })}
                        >
                          {t("admin.closeBatch")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={busy !== null}
                        onClick={() =>
                          void withBusy(`brief:${batch.id}`, async () => {
                            await api.runWeekly(batch.id);
                            setNotice(t("brief.ready"));
                            await load();
                          })
                        }
                      >
                        {busy === `brief:${batch.id}` ? <><Spinner /> {t("brief.generating")}</> : t("admin.runWeekly")}
                      </button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="divider" />
          <div className="stack-sm">
            <div className="row">
              <Field label={t("admin.name")}>
                <input className="input" value={batchForm.name} onChange={(event) => setBatchForm({ ...batchForm, name: event.target.value })} placeholder="Week 2026-W48" />
              </Field>
              <Field label={t("admin.start")}>
                <input className="input" type="datetime-local" value={batchForm.start} onChange={(event) => setBatchForm({ ...batchForm, start: event.target.value })} />
              </Field>
              <Field label={t("admin.end")}>
                <input className="input" type="datetime-local" value={batchForm.end} onChange={(event) => setBatchForm({ ...batchForm, end: event.target.value })} />
              </Field>
            </div>
            <div>
              <button
                type="button"
                className="btn"
                disabled={busy !== null || batchForm.name.trim() === ""}
                onClick={() =>
                  void withBusy("createBatch", async () => {
                    await api.createBatch({
                      name: batchForm.name.trim(),
                      startTime: new Date(batchForm.start).toISOString(),
                      endTime: new Date(batchForm.end).toISOString(),
                    });
                    setBatchForm({ ...batchForm, name: "" });
                    await load();
                  })
                }
              >
                {t("admin.createBatch")}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>{t("admin.import")}</h3></div>
          <div className="small muted" style={{ marginBottom: 8 }}>{t("admin.importHint")}</div>
          <div className="flex flex-wrap">
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file === undefined) return;
                void withBusy("import", async () => {
                  const text = await file.text();
                  const parsed: unknown = JSON.parse(text);
                  const result = await api.importSnapshot(parsed);
                  setNotice(`${t("admin.imported")}：${JSON.stringify(result.counts)}`);
                  await load();
                });
              }}
            />
            <a className="btn btn-sm" href="/api/vg/export/snapshot/all.json" download>{t("footer.export")}</a>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                void withBusy("backup", async () => {
                  await downloadWithToken("/api/vg/backup", `vg-backup-${Date.now()}.sqlite`);
                  setNotice(t("admin.backup"));
                })
              }
            >
              {busy === "backup" ? <><Spinner /> {t("common.saving")}</> : t("admin.backup")}
            </button>
          </div>
          <div className="muted tiny" style={{ marginTop: 6 }}>{t("admin.backupHint")}</div>
        </div>

        <div className="card">
          <div className="card-head"><h3>{t("admin.documents")}</h3></div>
          {documents.length === 0 ? (
            <Empty />
          ) : (
            <div className="stack-sm">
              {documents.map((document) => (
                <DocEditor key={document.id} document={document} onSaved={load} />
              ))}
            </div>
          )}

          <div className="divider" />
          <div className="stack-sm">
            <div className="row">
              <Field label={t("docs.slug")}>
                <input className="input" value={docForm.slug} onChange={(event) => setDocForm({ ...docForm, slug: event.target.value })} placeholder="guide" />
              </Field>
              <Field label={t("venture.title")}>
                <input className="input" value={docForm.title} onChange={(event) => setDocForm({ ...docForm, title: event.target.value })} />
              </Field>
              <Field label={t("docs.kind")}>
                <select className="select" value={docForm.kind} onChange={(event) => setDocForm({ ...docForm, kind: event.target.value as DocumentKind })}>
                  {DOC_KINDS.map((kind) => (
                    <option key={kind} value={kind}>{t(`docs.kinds.${kind}`)}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={t("docs.body")}>
              <textarea className="textarea textarea-lg" value={docForm.bodyMd} onChange={(event) => setDocForm({ ...docForm, bodyMd: event.target.value })} />
            </Field>
            <div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null || docForm.slug.trim() === "" || docForm.title.trim() === ""}
                onClick={() =>
                  void withBusy("createDoc", async () => {
                    await api.createDocument({
                      slug: docForm.slug.trim(),
                      title: docForm.title.trim(),
                      kind: docForm.kind,
                      bodyMd: docForm.bodyMd,
                    });
                    setDocForm({ slug: "", title: "", kind: "guide", bodyMd: "" });
                    await load();
                  })
                }
              >
                {t("admin.newDoc")}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>{t("admin.llmCalls")}</h3></div>
          {calls.length === 0 ? (
            <Empty />
          ) : (
            <div className="stack-sm">
              {calls.map((call, index) => (
                <div key={String(call.id ?? index)} className="flex spread small">
                  <span className={`badge ${call.status === "ok" ? "badge-ready" : "badge-failed"}`}>{String(call.status)}</span>
                  <span className="mono tiny">{String(call.purpose)}</span>
                  <span className="muted tiny">{String(call.model)}</span>
                  <span className="mono tiny">{String(call.durationMs)}ms</span>
                  <span className="muted tiny">{formatDate(String(call.at))}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==================== 入口：先门禁，再渲染控制台 ==================== */

export function AdminPage() {
  const auth = useAuth();
  if (auth.status === "checking") return <Loading />;
  if (auth.status !== "admin") return <LoginView />;
  return <AdminConsole />;
}