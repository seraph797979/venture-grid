// modules/venture-grid/ui/src/pages/HomePage.tsx
import { useEffect, useMemo, useState } from "react";
import { api, type GraphResponse, type StateResponse } from "../api/client";
import { GraphCanvas } from "../components/GraphCanvas";
import { VenturePanel } from "../components/VenturePanel";
import { Empty, ErrorNotice, Loading, TagList, TrendArrow } from "../components/Bits";
import { SearchBox } from "../components/SearchBox";
import { SubmitForm } from "../components/SubmitForm";
import { t } from "../i18n";
import { Link } from "../router";
import { formatDate } from "../lib/format";

export function HomePage() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.state(), api.graph()])
      .then(([nextState, nextGraph]) => {
        if (!alive) return;
        setState(nextState);
        setGraph(nextGraph);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason);
      });
    return () => {
      alive = false;
    };
  }, []);

  const scoreById = useMemo(() => {
    const map = new Map<string, { score: number; trend: "up" | "flat" | "down" }>();
    for (const node of graph?.nodes ?? []) {
      if (node.score !== null && node.trend !== null) {
        map.set(node.id, { score: node.score, trend: node.trend });
      }
    }
    return map;
  }, [graph]);

  if (error !== null && state === null) {
    return (
      <div className="container">
        <ErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="container">
      <section className="hero">
        <h1>Venture-Grid</h1>
        <div className="intro">
          <p className="lead">{t("hero.p1")}</p>
          <p>{t("hero.p2")}</p>
          <p>{t("hero.p3")}</p>
          <p>{t("hero.p4")}</p>
          <p>{t("hero.p5")}</p>
        </div>
        <div className="flex flex-wrap" style={{ marginTop: 16 }}>
          <Link to="/graph" className="btn btn-primary">{t("hero.explore")}</Link>
          <a href="#submit" className="btn">{t("submit.title")}</a>
        </div>
        <div style={{ maxWidth: 560, marginTop: 14 }}>
          <SearchBox />
        </div>
      </section>

      {state === null ? (
        <Loading />
      ) : (
        <>
          <div className="stats">
            <div className="stat"><div className="n">{state.counts.total}</div><div className="l">{t("stats.total")}</div></div>
            <div className="stat"><div className="n">{state.counts.active}</div><div className="l">{t("stats.active")}</div></div>
            <div className="stat"><div className="n">{state.counts.suspended}</div><div className="l">{t("stats.suspended")}</div></div>
            <div className="stat"><div className="n">{state.counts.closed}</div><div className="l">{t("stats.closed")}</div></div>
            <div className="stat">
              <div className="n" style={{ fontSize: 16, paddingTop: 7 }}>{state.currentBatch?.name ?? "—"}</div>
              <div className="l">{t("stats.currentBatch")}</div>
            </div>
          </div>

          <div className="home-grid">
            <div>
              {graph === null ? (
                <Loading />
              ) : (
                <GraphCanvas
                  graph={graph}
                  onSelect={setSelected}
                  foldedDepth={graph.nodes.length > 60 ? 2 : undefined}
                />
              )}
              <div className="flex spread" style={{ marginTop: 8 }}>
                <span className="muted small">{t("graph.zoomHint")}</span>
                <Link to="/graph" className="btn btn-sm">{t("nav.graph")}</Link>
              </div>
              {graph !== null && graph.nodes.length > 60 && (
                <div className="notice notice-info" style={{ marginTop: 8 }}>{t("graph.folded")}</div>
              )}

              <section id="submit" style={{ marginTop: 22 }}>
                <div className="card-head">
                  <h3 style={{ margin: 0 }}>{t("submit.title")}</h3>
                </div>
                <p className="muted small" style={{ marginTop: -6 }}>{t("submit.intro")}</p>
                <SubmitForm />
              </section>
            </div>

            <div className="stack">
              <div className="card card-flat">
                <div className="card-head">
                  <h3>{t("stats.recent")}</h3>
                  <Link to="/timeline" className="small">{t("nav.timeline")}</Link>
                </div>
                {state.recentVentures.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="list">
                    {state.recentVentures.map((venture) => {
                      const latest = scoreById.get(venture.id);
                      return (
                        <div key={venture.id} className="list-item">
                          <div className="h">
                            <Link to={`/venture/${venture.id}`} style={{ fontWeight: 600, fontSize: 13 }}>
                              {venture.title}
                            </Link>
                            {latest !== undefined ? (
                              <TrendArrow trend={latest.trend} score={latest.score} />
                            ) : (
                              <span className="muted tiny">{t("venture.noScore")}</span>
                            )}
                          </div>
                          <div className="body">{venture.summary}</div>
                          <div className="flex spread">
                            <TagList tags={venture.tags} />
                            <span className="tiny muted">{formatDate(venture.updatedAt)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="card card-flat">
                <div className="card-head">
                  <h3>{t("stats.events")}</h3>
                </div>
                {state.recentEvents.length === 0 ? (
                  <Empty />
                ) : (
                  <div>
                    {state.recentEvents.slice(0, 6).map((event) => (
                      <div key={event.id} className="event">
                        <span className="when">{formatDate(event.at)}</span>
                        <span className="small">
                          {event.ventureTitle === null ? (
                            <span className="muted">{event.kind}</span>
                          ) : (
                            <Link to={`/venture/${event.ventureId ?? ""}`}>{event.ventureTitle}</Link>
                          )}
                          <span className="kind-chip" style={{ marginLeft: 8 }}>{event.kind}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {selected !== null && <VenturePanel id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}