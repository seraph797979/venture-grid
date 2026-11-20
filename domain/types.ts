// modules/venture-grid/domain/types.ts
/** VG 领域类型。数据库列名 snake_case，仓储层负责映射到这里的 camelCase。 */

export type VentureStatus = "active" | "suspended" | "closed";
export type RelationType = "support" | "contradict" | "depend" | "parallel";
export type Trend = "up" | "flat" | "down";
export type BatchStatus = "open" | "closed";
export type BriefStatus = "pending" | "generating" | "ready" | "failed";
export type DocumentKind = "evidence_source" | "guide" | "glossary" | "brief_archive";
export type AbstractSource = "llm" | "admin_edited";

export type EventKind =
  | "venture_added"
  | "score_changed"
  | "evidence_added"
  | "link_added"
  | "status_changed"
  | "venture_forked"
  | "document_added"
  | "brief_generated";

export type RunStatus = "running" | "success" | "failed" | "aborted";

export type ProposalStatus = "pending" | "accepted" | "rejected";

/** 访客提交的探究方向；管理员审核通过后才生成 Venture。 */
export interface VentureProposal {
  id: string;
  title: string;
  summary: string;
  hypothesis: string;
  referencesText: string;
  tags: string[];
  submitter: string | null;
  /** 审核结果通知邮箱 */
  email: string | null;
  status: ProposalStatus;
  reviewNote: string | null;
  /** ai = 每周 agent 审核；admin = 人工 */
  reviewedBy: string | null;
  ventureId: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface Venture {
  id: string;
  title: string;
  summary: string;
  hypothesis: string;
  parentId: string | null;
  status: VentureStatus;
  tags: string[];
  forkOrigin: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Evidence {
  id: string;
  ventureId: string;
  sourceTitle: string;
  sourceUrl: string | null;
  abstract: string;
  abstractSource: AbstractSource;
  tags: string[];
  documentId: string | null;
  addedAt: string;
}

export interface VentureLink {
  id: string;
  fromVentureId: string;
  toVentureId: string;
  relationType: RelationType;
  note: string | null;
  createdAt: string;
}

export interface ScoreRecord {
  id: string;
  ventureId: string;
  batchId: string;
  score: number;
  comment: string;
  trend: Trend;
  evidenceRefs: string[];
  createdAt: string;
}

export interface Batch {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  status: BatchStatus;
  briefStatus: BriefStatus;
  briefContent: string;
  briefError: string | null;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface VgEvent {
  id: string;
  kind: EventKind;
  ventureId: string | null;
  batchId: string | null;
  payload: Record<string, unknown>;
  actor: string;
  at: string;
}

export interface VgDocument {
  id: string;
  slug: string;
  title: string;
  kind: DocumentKind;
  bodyMd: string;
  sourceUrl: string | null;
  ventureId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VgRun {
  id: string;
  kind: string;
  batchId: string | null;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  stats: Record<string, unknown>;
}

export interface LlmCallRecord {
  id: string;
  provider: string;
  model: string;
  purpose: string;
  status: "ok" | "error";
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number;
  promptChars: number;
  promptSha256: string;
  at: string;
}

/** 单条 Venture 的详情聚合（详情页/侧栏直接吃这个） */
export interface VentureDetail {
  venture: Venture;
  parent: Venture | null;
  children: Venture[];
  evidences: Evidence[];
  scores: ScoreRecord[];
  links: VentureLink[];
  latestScore: { score: number; trend: Trend; at: string } | null;
}

/** 周报聚合结果（四类事件，PRD §3.5） */
export interface BriefScoreChange {
  ventureId: string;
  title: string;
  previousScore: number | null;
  score: number;
  trend: Trend;
  comment: string;
}

export interface BriefEvidenceItem {
  id: string;
  ventureId: string;
  ventureTitle: string;
  sourceTitle: string;
  abstract: string;
}

export interface BriefLinkItem {
  id: string;
  fromId: string;
  fromTitle: string;
  toId: string;
  toTitle: string;
  relationType: RelationType;
  note: string | null;
}

export interface BriefData {
  batch: Batch;
  added: Array<{ id: string; title: string; status: VentureStatus; parentId: string | null }>;
  scoreChanges: BriefScoreChange[];
  evidences: BriefEvidenceItem[];
  links: BriefLinkItem[];
}

/** Fork 快照（v1） */
export interface SnapshotV1 {
  schema: "vg-snapshot@1";
  snapshotId: string;
  exportedAt: string;
  sourceInstance: string;
  ventures: Venture[];
  evidences: Evidence[];
  links: VentureLink[];
  scores: ScoreRecord[];
  batches: Batch[];
  documents: VgDocument[];
}