// modules/venture-grid/ui/src/pages/TimelinePage.tsx
import { useEffect, useMemo, useState } from "react";
import { api, type TimelineItem } from "../api/client";
import { Empty, ErrorNotice, Loading } from "../components/Bits";
import { t } from "../i18n";
import { Link } from "../router";
import { formatDay } from "../lib/format";

function payloadSummary(event: TimelineItem): string {
  const payload = event.payload;
  switch (event.kind) {
    case "score_changed": {
      const score = payload.score;
      const previous = payload.previousScore;
      const trend = payload.trend;
      return `${previous === null || previous === undefined ? "—" : String(previous)} → ${String(score)} · ${String(trend)}`;
    }
    case "evidence_added":
      return typeof payload.sourceTitle === "string" ? payload.sourceTitle : "";
    case "link_added":
      return typeof payload.relationType === "string" ? t(`relation.${payload.relationType as "support"}`) : "";
    case "status_changed":
      return `${String(payload.from)} → ${String(payload.to)}`;
    case "document_added":
      return typeof payload.title === "string" ? payload.title : "";
    case "venture_forked":
      return typeof payload.forkOrigin === "string" ? payload.forkOrigin : "";
    case "brief_generated":
      return typeof payload.chars === "number" ? `${payload.chars} chars` : "";
    default:
      return "";
  }
}

export function TimelinePage() {
  const [events, setEvents] = useState<TimelineItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api
      .timeline({ limit: 500 })
      .then((value) => setEvents(value.events))
      .catch((reason: unknown) => setError(reason));
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, TimelineItem[]>();
    for (const event of events ?? []) {
      const day = formatDay(event.at);
      const list = map.get(day) ?? [];
      list.push(event);
      map.set(day, list);
    }
    return [...map.entries()];
  }, [events]);

  return (
    <div className="container">
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>{t("nav.timeline")}</h2>
        <span className="muted small">{t("search.hint")}</span>
      </div>
      {error !== null && <ErrorNotice error={error} />}
      {events === null ? (
        <Loading />
      ) : events.length === 0 ? (
        <Empty />
      ) : (
        <div className="stack">
          {groups.map(([day, list]) => (
            <div key={day} className="card card-flat">
              <div className="card-head">
                <h3>{day}</h3>
                <span className="muted tiny">{list.length} {t("common.count")}</span>
              </div>
              {list.map((event) => (
                <div key={event.id} className="event">
                  <span className="when">{event.at.slice(11, 16)}</span>
                  <span className="small">
                    <span className="badge" style={{ marginRight: 8 }}>{t(`events.${event.kind}`)}</span>
                    {event.ventureId !== null && event.ventureTitle !== null ? (
                      <Link to={`/venture/${event.ventureId}`}>{event.ventureTitle}</Link>
                    ) : (
                      <span className="muted">{event.ventureTitle ?? "—"}</span>
                    )}
                    <span className="muted" style={{ marginLeft: 10 }}>{payloadSummary(event)}</span>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}