// modules/venture-grid/ui/src/pages/AboutPage.tsx
import { t } from "../i18n";
import { Link } from "../router";

const TERMS = [
  { term: "about.vgTerm", desc: "about.vgDesc" },
  { term: "about.ventureTerm", desc: "about.ventureDesc" },
  { term: "about.batchTerm", desc: "about.batchDesc" },
  { term: "about.snapshotTerm", desc: "about.snapshotDesc" },
  { term: "about.anchorTerm", desc: "about.anchorDesc" },
] as const;

export function AboutPage() {
  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <h1>{t("about.title")}</h1>
      <div className="card">
        <h2>{t("about.glossary")}</h2>
        <dl className="kv" style={{ gridTemplateColumns: "170px 1fr", gap: "12px 18px" }}>
          {TERMS.map((item) => (
            <div key={item.term} style={{ display: "contents" }}>
              <dt style={{ fontWeight: 620, color: "var(--ink)" }}>{t(item.term)}</dt>
              <dd>{t(item.desc)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>{t("about.philosophy")}</h2>
        <p>{t("about.philosophy1")}</p>
        <p>{t("about.philosophy2")}</p>
        <p>{t("about.philosophy3")}</p>
        <div className="muted small" style={{ marginTop: 8 }}>
          <Link to="/docs/guide">{t("footer.guide")}</Link>
        </div>
      </div>
    </div>
  );
}