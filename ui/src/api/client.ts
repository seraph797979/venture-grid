// modules/venture-grid/ui/src/api/client.ts
/** 前端 API 客户端。写操作自动带管理员令牌；错误统一抛 ApiError(code)。 */
import type { GraphEdge, GraphNode } from "../../../domain/layout";
import type {
  Batch,
  BriefData,
  Evidence,
  ScoreRecord,
  Venture,
  VentureDetail,
  VentureLink,
  VgDocument,
  VgEvent,
  VgRun,
} from "../../../domain/types";
import type { DatasetView } from "../../../domain/dataset";
import type { VentureProposal } from "../../../domain/types";

export type { VentureDetail } from "../../../domain/types";

export const TOKEN_KEY = "vg_admin_token";

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string): void {
  if (token.trim() === "") localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token.trim());
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type TimelineItem = VgEvent & { ventureTitle: string | null };

export type StateResponse = {
  instance: string;
  counts: { total: number; active: number; suspended: number; closed: number };
  batchCount: number;
  documentCount: number;
  eventCount: number;
  currentBatch: Batch | null;
  latestReadyBatch: Batch | null;
  recentEvents: TimelineItem[];
  recentVentures: Venture[];
  llm: { configured: boolean; provider: string | null; model: string | null; hint: string };
  email: { configured: boolean; provider: string | null; hint: string };
};

export type GraphResponse = { nodes: GraphNode[]; edges: GraphEdge[]; maxDepth: number };

export type BriefResponse = {
  batch: Batch;
  counts: { added: number; scoreChanges: number; evidences: number; links: number };
  data: BriefData;
  runs: VgRun[];
};

export type DocumentsResponse = { documents: VgDocument[] };

export type SearchIndexResponse = {
  ventures: Array<{ id: string; title: string; summary: string; hypothesis: string; tags: string[] }>;
  evidences: Array<{ id: string; ventureId: string; sourceTitle: string; abstract: string; tags: string[] }>;
  documents: Array<{ id: string; slug: string; title: string; bodyMd: string }>;
};

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token !== "") headers.set("Authorization", `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, body });
  } catch (error) {
    throw new ApiError(0, "network", error instanceof Error ? error.message : String(error));
  }
  const text = await response.text();
  let payload: unknown = null;
  if (text !== "") {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const record = (payload ?? {}) as Record<string, unknown>;
    throw new ApiError(
      response.status,
      typeof record.code === "string" ? record.code : "generic",
      typeof record.error === "string" ? record.error : `HTTP ${response.status}`,
      record.detail,
    );
  }
  return payload as T;
}

export const api = {
  state: () => request<StateResponse>("/api/vg/state"),
  ventures: (params: { status?: string; tag?: string; batch?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.status) search.set("status", params.status);
    if (params.tag) search.set("tag", params.tag);
    if (params.batch) search.set("batch", params.batch);
    const suffix = search.toString() === "" ? "" : `?${search.toString()}`;
    return request<{ ventures: Venture[] }>(`/api/vg/ventures${suffix}`);
  },
  venture: (id: string) => request<VentureDetail>(`/api/vg/ventures/${encodeURIComponent(id)}`),
  datasets: (ventureId: string, force = false) =>
    request<{ datasets: DatasetView[] }>(
      `/api/vg/ventures/${encodeURIComponent(ventureId)}/datasets${force ? "?force=1" : ""}`,
    ),
  refreshDataset: (ventureId: string, datasetId: string) =>
    request<{ dataset: DatasetView }>(
      `/api/vg/ventures/${encodeURIComponent(ventureId)}/datasets/${encodeURIComponent(datasetId)}/refresh`,
      { method: "POST", json: {} },
    ),
  graph: () => request<GraphResponse>("/api/vg/graph"),
  timeline: (params: { from?: string; to?: string; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.from) search.set("from", params.from);
    if (params.to) search.set("to", params.to);
    if (params.limit) search.set("limit", String(params.limit));
    const suffix = search.toString() === "" ? "" : `?${search.toString()}`;
    return request<{ events: TimelineItem[] }>(`/api/vg/timeline${suffix}`);
  },
  batches: () => request<{ batches: Batch[] }>("/api/vg/batches"),
  batch: (id: string) => request<Batch>(`/api/vg/batches/${encodeURIComponent(id)}`),
  brief: (id: string) => request<BriefResponse>(`/api/vg/batches/${encodeURIComponent(id)}/brief`),
  searchIndex: () => request<SearchIndexResponse>("/api/vg/search-index"),
  documents: () => request<DocumentsResponse>("/api/vg/documents"),
  document: (slug: string) => request<VgDocument>(`/api/vg/documents/${encodeURIComponent(slug)}`),
  runs: (limit = 50) => request<{ runs: VgRun[] }>(`/api/vg/runs?limit=${limit}`),
  llmCalls: (limit = 50) =>
    request<{ calls: Array<Record<string, unknown>> }>(`/api/vg/llm-calls?limit=${limit}`),

  createVenture: (input: {
    title: string;
    summary?: string;
    hypothesis?: string;
    parentId?: string | null;
    tags?: string[];
  }) => request<{ venture: Venture }>("/api/vg/ventures", { method: "POST", json: input }),
  updateVenture: (id: string, input: Record<string, unknown>) =>
    request<{ venture: Venture }>(`/api/vg/ventures/${encodeURIComponent(id)}`, {
      method: "PATCH",
      json: input,
    }),
  forkVenture: (id: string, input: { title: string; summary?: string; hypothesis?: string; tags?: string[] }) =>
    request<{ venture: Venture }>(`/api/vg/ventures/${encodeURIComponent(id)}/fork`, {
      method: "POST",
      json: input,
    }),
  addEvidence: (
    id: string,
    input: { sourceTitle: string; sourceUrl?: string | null; rawText: string; tags?: string[]; documentId?: string | null },
  ) =>
    request<{ evidence: Evidence; llm: { provider: string; model: string; durationMs: number } }>(
      `/api/vg/ventures/${encodeURIComponent(id)}/evidences`,
      { method: "POST", json: input },
    ),
  updateEvidence: (id: string, abstract: string) =>
    request<{ evidence: Evidence }>(`/api/vg/evidences/${encodeURIComponent(id)}`, {
      method: "PATCH",
      json: { abstract },
    }),
  addScore: (id: string, input: { score: number; comment: string; evidenceRefs?: string[] }) =>
    request<{ score: ScoreRecord }>(`/api/vg/ventures/${encodeURIComponent(id)}/scores`, {
      method: "POST",
      json: input,
    }),
  addLink: (input: { fromVentureId: string; toVentureId: string; relationType: string; note?: string | null }) =>
    request<{ link: VentureLink }>("/api/vg/links", { method: "POST", json: input }),

  createBatch: (input: { name: string; startTime: string; endTime: string }) =>
    request<{ batch: Batch }>("/api/vg/batches", { method: "POST", json: input }),
  ensureCurrentBatch: () => request<{ batch: Batch }>("/api/vg/batches/current", { method: "POST", json: {} }),
  closeBatch: (id: string) =>
    request<{ batch: Batch }>(`/api/vg/batches/${encodeURIComponent(id)}/close`, { method: "POST", json: {} }),
  setBatchNote: (id: string, adminNote: string) =>
    request<{ batch: Batch }>(`/api/vg/batches/${encodeURIComponent(id)}`, {
      method: "PATCH",
      json: { adminNote },
    }),
  runWeekly: (id: string) =>
    request<{ runId: string; batchId: string; content: string }>(
      `/api/vg/batches/${encodeURIComponent(id)}/brief`,
      { method: "POST", json: {} },
    ),

  importSnapshot: (snapshot: unknown) =>
    request<{ forkOrigin: string; counts: Record<string, number>; warnings: string[] }>(
      "/api/vg/snapshots/import",
      { method: "POST", json: { snapshot } },
    ),
  createDocument: (input: {
    slug: string;
    title: string;
    kind: string;
    bodyMd: string;
    sourceUrl?: string | null;
    ventureId?: string | null;
  }) => request<{ document: VgDocument }>("/api/vg/documents", { method: "POST", json: input }),
  updateDocument: (id: string, input: Record<string, unknown>) =>
    request<{ document: VgDocument }>(`/api/vg/documents/${encodeURIComponent(id)}`, {
      method: "PATCH",
      json: input,
    }),

  checkAdmin: () => request<{ ok: boolean }>("/api/vg/admin/check"),

  // 访客提案：提单是公开接口；列表/采纳/拒绝需要令牌
  submitProposal: (input: {
    title: string;
    hypothesis: string;
    summary?: string;
    referencesText?: string;
    tags?: string[];
    submitter?: string | null;
    email: string;
    website?: string;
  }) => request<{ proposal: VentureProposal }>("/api/vg/proposals", { method: "POST", json: input }),
  proposals: (status?: string) =>
    request<{
      proposals: VentureProposal[];
      pending: number;
      emailLogs: Array<{
        id: string;
        proposalId: string | null;
        toEmail: string;
        subject: string;
        status: "sent" | "failed";
        provider: string;
        error: string | null;
        at: string;
      }>;
    }>(`/api/vg/proposals${status === undefined ? "" : `?status=${encodeURIComponent(status)}`}`),
};

/** 需要带令牌的下载（备份）；其余导出走普通链接即可。 */
export async function downloadWithToken(path: string, filename: string): Promise<void> {
  const headers = new Headers();
  const token = getToken();
  if (token !== "") headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { headers });
  if (!response.ok) throw new ApiError(response.status, "download_failed", `HTTP ${response.status}`);
  const blob = await response.blob();
  saveBlob(blob, filename);
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function saveText(text: string, filename: string, type = "text/markdown;charset=utf-8"): void {
  saveBlob(new Blob([text], { type }), filename);
}