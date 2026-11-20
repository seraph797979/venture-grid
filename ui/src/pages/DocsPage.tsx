// modules/venture-grid/ui/src/pages/DocsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { Empty, ErrorNotice, Loading } from "../components/Bits";
import { Markdown } from "../components/Markdown";
import { t } from "../i18n";
import { Link } from "../router";
import { formatDate } from "../lib/format";
import type { DocumentKind, VgDocument } from "../../../domain/types";

const KIND_ORDER: DocumentKind[] = ["guide", "glossary", "evidence_source", "brief_archive"];

export function DocsPage({ slug }: { slug: string | null }) {
  const [documents, setDocuments] = useState<VgDocument[] | null>(null);
  const [detail, setDetail] = useState<VgDocument | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (slug !== null) {
      setDetail(null);
      api
        .document(slug)
        .then(setDetail)
        .catch((reason: unknown) => setError(reason));
    } else {
      api
        .documents()
        .then((value) => setDocuments(value.documents))
        .catch((reason: unknown) => setError(reason));
    }
  }, [slug]);

  const groups = useMemo(() => {
    return KIND_ORDER.map((kind) => ({
      kind,
      items: (documents ?? []).filter((document) => document.kind === kind),
    })).filter((group) => group.items.length > 0);
  }, [documents]);

  if (slug !== null) {
    return (
      <div className="container">
        <div className="flex small" style={{ marginBottom: 12 }}>
          <Link to="/docs">{t("docs.title")}</Link>
          <span className="muted">/</span>
          <span className="mono">{slug}</span>
        </div>
        {error !== null && <ErrorNotice error={error} />}
        {detail === null && error === null && <Loading />}
        {detail !== null && (
          <div className="card">
            <div className="spread" style={{ marginBottom: 10 }}>
              <h1 style={{ margin: 0 }}>{detail.title}</h1>
              <span className="badge">{t(`docs.kinds.${detail.kind}`)}</span>
            </div>
            <div className="muted tiny" style={{ marginBottom: 12 }}>{formatDate(detail.updatedAt)}</div>
            <Markdown source={detail.bodyMd} />
            {detail.sourceUrl !== null && (
              <div style={{ marginTop: 14 }}>
                <a href={detail.sourceUrl} target="_blank" rel="noreferrer noopener">{detail.sourceUrl}</a>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container">
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>{t("docs.title")}</h2>
        <span className="muted small">{t("docs.runtimeHint")}</span>
      </div>
      {error !== null && <ErrorNotice error={error} />}
      {documents === null ? (
        <Loading />
      ) : documents.length === 0 ? (
        <Empty text={t("docs.noDocs")} />
      ) : (
        <div className="stack">
          {groups.map((group) => (
            <div key={group.kind} className="card card-flat">
              <div className="card-head">
                <h3>{t(`docs.kinds.${group.kind}`)}</h3>
                <span className="muted tiny">{group.items.length}</span>
              </div>
              <div className="list">
                {group.items.map((document) => (
                  <div key={document.id} className="list-item">
                    <div className="h">
                      <Link to={`/docs/${document.slug}`} style={{ fontWeight: 600 }}>{document.title}</Link>
                      <span className="tiny muted">{formatDate(document.updatedAt)}</span>
                    </div>
                    <div className="body">{document.bodyMd.replace(/[#*`>\n]/g, " ").slice(0, 140)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}