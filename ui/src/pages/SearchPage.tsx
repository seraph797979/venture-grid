// modules/venture-grid/ui/src/pages/SearchPage.tsx
import { useEffect, useMemo, useState } from "react";
import { api, type SearchIndexResponse } from "../api/client";
import { Empty, ErrorNotice, Loading } from "../components/Bits";
import { buildSearchIndex, runSearch, type SearchHit } from "../lib/fuse";
import { t } from "../i18n";
import { Link, setQuery, useLocationString } from "../router";

const GROUP_ORDER: Array<{ kind: SearchHit["kind"]; key: string }> = [
  { kind: "venture", key: "search.inVentures" },
  { kind: "evidence", key: "search.inEvidences" },
  { kind: "document", key: "search.inDocs" },
];

export function SearchPage() {
  const location = useLocationString();
  const query = new URLSearchParams(location.split("?")[1] ?? "").get("q") ?? "";
  const [value, setValue] = useState(query);
  const [index, setIndex] = useState<SearchIndexResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setValue(query);
  }, [query]);

  useEffect(() => {
    api
      .searchIndex()
      .then(setIndex)
      .catch((reason: unknown) => setError(reason));
  }, []);

  const bundle = useMemo(() => (index === null ? null : buildSearchIndex(index)), [index]);
  const hits = useMemo(() => (bundle === null ? [] : runSearch(bundle, query)), [bundle, query]);

  return (
    <div className="container">
      <h2>{t("search.title")}</h2>
      <form
        className="search-bar"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery("q", value.trim());
        }}
      >
        <input className="input grow" value={value} onChange={(event) => setValue(event.target.value)} placeholder={t("search.placeholder")} autoFocus />
        <button type="submit" className="btn btn-primary">{t("nav.search")}</button>
      </form>
      <div className="muted tiny" style={{ marginTop: 6 }}>{t("search.hint")}</div>

      {error !== null && <div style={{ marginTop: 12 }}><ErrorNotice error={error} /></div>}
      {index === null ? (
        <Loading />
      ) : query.trim() === "" ? (
        <div className="notice notice-info" style={{ marginTop: 16 }}>{t("search.placeholder")}</div>
      ) : hits.length === 0 ? (
        <Empty text={t("search.noResults")} />
      ) : (
        <div>
          {GROUP_ORDER.map((group) => {
            const items = hits.filter((hit) => hit.kind === group.kind);
            if (items.length === 0) return null;
            return (
              <div key={group.kind} className="search-group">
                <h3>{t(group.key)} <span className="muted small">{items.length}</span></h3>
                <div className="list">
                  {items.map((hit) => {
                    const href =
                      hit.kind === "venture"
                        ? `/venture/${hit.id}`
                        : hit.kind === "document"
                          ? `/docs/${hit.slug ?? ""}`
                          : `/venture/${hit.ventureId ?? ""}`;
                    return (
                      <div key={`${hit.kind}:${hit.id}`} className="list-item">
                        <div className="h">
                          <Link to={href} style={{ fontWeight: 600, fontSize: 13 }}>{hit.title}</Link>
                          <span className="kind-chip">{hit.kind}</span>
                        </div>
                        {hit.text !== "" && <div className="body">{hit.text}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}