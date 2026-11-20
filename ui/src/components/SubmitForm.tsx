// modules/venture-grid/ui/src/components/SubmitForm.tsx
/** 提案表单：首页内嵌与 /submit 页共用。 */
import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import { Field, Notice, Spinner, errorMessage } from "./Bits";
import { t } from "../i18n";
import { Link } from "../router";
import { parseTags } from "../lib/format";

const EMPTY = {
  title: "",
  summary: "",
  hypothesis: "",
  referencesText: "",
  tags: "",
  submitter: "",
  email: "",
  website: "",
};

export function SubmitForm() {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<{ id: string; title: string } | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.submitProposal({
        title: form.title,
        hypothesis: form.hypothesis,
        summary: form.summary,
        referencesText: form.referencesText,
        tags: parseTags(form.tags),
        submitter: form.submitter.trim() === "" ? null : form.submitter,
        email: form.email.trim(),
        website: form.website,
      });
      setDone({ id: result.proposal.id, title: result.proposal.title });
      setForm(EMPTY);
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  };

  if (done !== null) {
    return (
      <div className="card stack">
        <Notice kind="ok">
          <strong>{done.title}</strong>
          <div style={{ marginTop: 4 }}>{t("submit.successHint")}</div>
          <div className="mono tiny" style={{ marginTop: 6 }}>{done.id}</div>
        </Notice>
        <div className="flex">
          <button type="button" className="btn" onClick={() => setDone(null)}>
            {t("submit.another")}
          </button>
          <Link to="/graph" className="btn btn-primary">{t("hero.explore")}</Link>
        </div>
      </div>
    );
  }

  return (
    <form className="card stack" onSubmit={(event) => void submit(event)} style={{ position: "relative" }}>
      <Field label={t("submit.titleField")} hint={t("submit.minHint")}>
        <input
          className="input"
          value={form.title}
          maxLength={200}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          required
        />
      </Field>
      <Field label={t("submit.summary")}>
        <input
          className="input"
          value={form.summary}
          maxLength={2000}
          onChange={(event) => setForm({ ...form, summary: event.target.value })}
        />
      </Field>
      <Field label={t("submit.hypothesis")}>
        <textarea
          className="textarea textarea-lg"
          value={form.hypothesis}
          maxLength={6000}
          onChange={(event) => setForm({ ...form, hypothesis: event.target.value })}
          required
        />
      </Field>
      <Field label={t("submit.references")} hint={t("submit.referencesHint")}>
        <textarea
          className="textarea"
          value={form.referencesText}
          maxLength={4000}
          onChange={(event) => setForm({ ...form, referencesText: event.target.value })}
        />
      </Field>
      <div className="row">
        <Field label={t("submit.tags")} hint="comma separated">
          <input
            className="input"
            value={form.tags}
            onChange={(event) => setForm({ ...form, tags: event.target.value })}
          />
        </Field>
        <Field label={t("submit.submitter")} hint={t("submit.submitterHint")}>
          <input
            className="input"
            value={form.submitter}
            maxLength={80}
            onChange={(event) => setForm({ ...form, submitter: event.target.value })}
          />
        </Field>
      </div>
      <Field label={t("submit.email")} hint={t("submit.emailHint")}>
        <input
          className="input"
          type="email"
          value={form.email}
          maxLength={200}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          required
        />
      </Field>

      {/* 蜜罐：正常用户看不到 */}
      <div className="hp" aria-hidden="true">
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(event) => setForm({ ...form, website: event.target.value })}
          />
        </label>
      </div>

      {error !== null && <Notice kind="error">{errorMessage(error)}</Notice>}

      <div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <><Spinner /> {t("submit.submitting")}</> : t("submit.button")}
        </button>
      </div>
    </form>
  );
}