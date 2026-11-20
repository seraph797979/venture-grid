// modules/venture-grid/ui/src/pages/GraphPage.tsx
import { useEffect, useMemo, useState } from "react";
import { api, type GraphResponse } from "../api/client";
import { GraphCanvas } from "../components/GraphCanvas";
import { VenturePanel } from "../components/VenturePanel";
import { ErrorNotice, Loading } from "../components/Bits";
import { t } from "../i18n";
import type { VentureStatus } from "../../../domain/types";
import { ORIGIN_ID } from "../lib/graph-ids";

export function GraphPage() {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState<"all" | VentureStatus>("all");
  const [tag, setTag] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api
      .graph()
      .then(setGraph)
      .catch((reason: unknown) => setError(reason));
  }, []);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const node of graph?.nodes ?? []) for (const item of node.tags) set.add(item);
    return [...set].sort();
  }, [graph]);

  const filtered = useMemo(() => {
    if (graph === null) return null;
    if (status === "all" && tag === "all") return graph;
    const nodes = graph.nodes.filter(
      (node) =>
        node.isAnchor ||
        node.id === ORIGIN_ID ||
        ((status === "all" || node.status === status) && (tag === "all" || node.tags.includes(tag))),
    );
    const ids = new Set(nodes.map((node) => node.id));
    return {
      nodes,
      edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
      maxDepth: graph.maxDepth,
    };
  }, [graph, status, tag]);

  return (
    <div className="container-wide">
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>{t("nav.graph")}</h2>
        <span className="grow" />
        <label className="flex small">
          {t("graph.filterStatus")}
          <select className="select" style={{ width: 120 }} value={status} onChange={(event) => setStatus(event.target.value as "all" | VentureStatus)}>
            <option value="all">{t("graph.all")}</option>
            <option value="active">{t("status.active")}</option>
            <option value="suspended">{t("status.suspended")}</option>
            <option value="closed">{t("status.closed")}</option>
          </select>
        </label>
        <label className="flex small">
          {t("graph.filterTag")}
          <select className="select" style={{ width: 140 }} value={tag} onChange={(event) => setTag(event.target.value)}>
            <option value="all">{t("graph.all")}</option>
            {tags.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>

      {error !== null && <ErrorNotice error={error} />}
      {filtered === null ? (
        <Loading />
      ) : (
        <GraphCanvas
          graph={filtered}
          onSelect={setSelected}
          heightClass="tall"
        />
      )}
      <div className="muted small" style={{ marginTop: 8 }}>{t("graph.zoomHint")}</div>

      {selected !== null && <VenturePanel id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}