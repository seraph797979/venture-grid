// modules/venture-grid/ui/src/lib/fuse.ts
/** 客户端 Fuse 索引：数据来自 /api/vg/search-index，不查数据库。 */
import Fuse from "fuse.js";
import type { SearchIndexResponse } from "../api/client";

export type SearchBundle = {
  ventures: Fuse<SearchIndexResponse["ventures"][number]>;
  evidences: Fuse<SearchIndexResponse["evidences"][number]>;
  documents: Fuse<SearchIndexResponse["documents"][number]>;
};

export function buildSearchIndex(index: SearchIndexResponse): SearchBundle {
  return {
    ventures: new Fuse(index.ventures, {
      keys: [
        { name: "title", weight: 2 },
        { name: "summary", weight: 1.2 },
        { name: "hypothesis", weight: 0.8 },
        { name: "tags", weight: 1 },
      ],
      threshold: 0.38,
      ignoreLocation: true,
    }),
    evidences: new Fuse(index.evidences, {
      keys: [
        { name: "sourceTitle", weight: 2 },
        { name: "abstract", weight: 1.4 },
        { name: "tags", weight: 1 },
      ],
      threshold: 0.4,
      ignoreLocation: true,
    }),
    documents: new Fuse(index.documents, {
      keys: [
        { name: "title", weight: 2 },
        { name: "bodyMd", weight: 1 },
      ],
      threshold: 0.42,
      ignoreLocation: true,
    }),
  };
}

export type SearchHit = {
  kind: "venture" | "evidence" | "document";
  id: string;
  title: string;
  text: string;
  ventureId?: string;
  slug?: string;
};

export function runSearch(bundle: SearchBundle, query: string, limit = 8): SearchHit[] {
  const trimmed = query.trim();
  if (trimmed === "") return [];
  const hits: SearchHit[] = [];
  for (const item of bundle.ventures.search(trimmed).slice(0, limit)) {
    hits.push({
      kind: "venture",
      id: item.item.id,
      title: item.item.title,
      text: item.item.summary,
    });
  }
  for (const item of bundle.evidences.search(trimmed).slice(0, limit)) {
    hits.push({
      kind: "evidence",
      id: item.item.id,
      title: item.item.sourceTitle,
      text: item.item.abstract,
      ventureId: item.item.ventureId,
    });
  }
  for (const item of bundle.documents.search(trimmed).slice(0, limit)) {
    hits.push({
      kind: "document",
      id: item.item.id,
      title: item.item.title,
      text: item.item.bodyMd.slice(0, 160),
      slug: item.item.slug,
    });
  }
  return hits;
}