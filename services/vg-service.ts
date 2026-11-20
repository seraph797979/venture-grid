// modules/venture-grid/services/vg-service.ts
/**
 * 业务服务层：所有跨表写操作在这里用单事务完成，并同步 append vg_event。
 * 不变量：
 *  - score 只追加；trend 写入时固化
 *  - evidence 摘要由调用方（API / agent）先走大模型，失败则根本不进本层
 *  - 任何写操作都要留事件，保证时间轴/周报/审计不缺项
 */
import type { Db } from "../db/database";
import { BatchRepo } from "../db/repos/batch.repo";
import { DocumentRepo } from "../db/repos/document.repo";
import { EvidenceRepo } from "../db/repos/evidence.repo";
import { EventRepo } from "../db/repos/event.repo";
import { LinkRepo } from "../db/repos/link.repo";
import { LlmCallRepo } from "../db/repos/llm-call.repo";
import { RunRepo } from "../db/repos/run.repo";
import { ScoreRepo } from "../db/repos/score.repo";
import { SettingRepo } from "../db/repos/setting.repo";
import { ProposalRepo } from "../db/repos/proposal.repo";
import { EmailLogRepo, type EmailLogRecord } from "../db/repos/email-log.repo";
import { VentureRepo, type VentureFilter } from "../db/repos/venture.repo";
import { DatasetService } from "./dataset-service";
import type { FetchLike } from "../datasource/exoplanet";
import { assembleBriefData } from "../domain/brief";
import { defaultIdFactory, nowIso, type IdFactory, type IdPrefix } from "../domain/ids";
import { buildGraph, type BuildGraphResult } from "../domain/layout";
import { createSnapshot, remapSnapshot, validateSnapshot } from "../domain/snapshot";
import { computeTrend } from "../domain/trend";
import { isoWeekInfo } from "../domain/week";
import type {
  Batch,
  BriefData,
  DocumentKind,
  Evidence,
  LlmCallRecord,
  ProposalStatus,
  RelationType,
  ScoreRecord,
  SnapshotV1,
  Trend,
  Venture,
  VentureDetail,
  VentureLink,
  VentureProposal,
  VentureStatus,
  VgDocument,
  VgEvent,
  VgRun,
  EventKind,
} from "../domain/types";
import {
  normalizeTags,
  validateDocumentInput,
  validateEvidenceInput,
  validateLinkInput,
  validateProposalInput,
  validateScoreInput,
  validateVentureInput,
} from "../domain/validation";
import { describeLlm } from "../llm/registry";
import { describeEmail } from "../email/registry";

export class ServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export type ServiceOptions = {
  db: Db;
  idFactory?: IdFactory;
  now?: () => string;
  instanceName?: string;
  /** 注入公开数据源的 fetch（测试用） */
  fetchImpl?: FetchLike;
};

export type StatePayload = {
  instance: string;
  counts: { total: number; active: number; suspended: number; closed: number };
  batchCount: number;
  documentCount: number;
  eventCount: number;
  pendingProposals: number;
  currentBatch: Batch | null;
  latestReadyBatch: Batch | null;
  recentEvents: TimelineItem[];
  recentVentures: Venture[];
  llm: { configured: boolean; provider: string | null; model: string | null; hint: string };
  email: { configured: boolean; provider: string | null; hint: string };
};

export type TimelineItem = VgEvent & { ventureTitle: string | null };

export type SearchIndex = {
  ventures: Array<{ id: string; title: string; summary: string; hypothesis: string; tags: string[] }>;
  evidences: Array<{ id: string; ventureId: string; sourceTitle: string; abstract: string; tags: string[] }>;
  documents: Array<{ id: string; slug: string; title: string; bodyMd: string }>;
};

export type CreateVentureInput = {
  title: string;
  summary?: string;
  hypothesis?: string;
  parentId?: string | null;
  status?: VentureStatus;
  tags?: string[];
};

export type CreateScoreInput = {
  score: number;
  comment: string;
  evidenceRefs?: string[];
  batchId?: string;
};

export type CreateEvidenceInput = {
  sourceTitle: string;
  sourceUrl?: string | null;
  abstract: string;
  tags?: string[];
  documentId?: string | null;
  abstractSource?: "llm" | "admin_edited";
};

export type CreateLinkInput = {
  fromVentureId: string;
  toVentureId: string;
  relationType: RelationType;
  note?: string | null;
};

export class VgService {
  readonly ventures: VentureRepo;
  readonly evidences: EvidenceRepo;
  readonly links: LinkRepo;
  readonly scores: ScoreRepo;
  readonly batches: BatchRepo;
  readonly events: EventRepo;
  readonly documents: DocumentRepo;
  readonly runs: RunRepo;
  readonly llmCalls: LlmCallRepo;
  readonly settings: SettingRepo;
  readonly datasets: DatasetService;
  readonly proposals: ProposalRepo;
  readonly emailLog: EmailLogRepo;

  private readonly makeId: IdFactory;
  private readonly clock: () => string;
  private readonly instanceName: string;

  constructor(options: ServiceOptions) {
    this.ventures = new VentureRepo(options.db);
    this.evidences = new EvidenceRepo(options.db);
    this.links = new LinkRepo(options.db);
    this.scores = new ScoreRepo(options.db);
    this.batches = new BatchRepo(options.db);
    this.events = new EventRepo(options.db);
    this.documents = new DocumentRepo(options.db);
    this.runs = new RunRepo(options.db);
    this.llmCalls = new LlmCallRepo(options.db);
    this.settings = new SettingRepo(options.db);
    this.proposals = new ProposalRepo(options.db);
    this.emailLog = new EmailLogRepo(options.db);
    this.makeId = options.idFactory ?? defaultIdFactory;
    this.clock = options.now ?? nowIso;
    this.instanceName = options.instanceName ?? process.env.VG_INSTANCE_NAME ?? "local";
    this.db = options.db;
    this.datasets = new DatasetService({
      db: options.db,
      now: this.clock,
      idFactory: (prefix) => this.makeId(prefix),
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    });
  }

  private readonly db: Db;

  private id(prefix: IdPrefix): string {
    return this.makeId(prefix);
  }

  private appendEvent(input: {
    kind: EventKind;
    ventureId?: string | null;
    batchId?: string | null;
    payload?: Record<string, unknown>;
    at?: string;
  }): void {
    this.events.append({
      id: this.id("vgevt"),
      kind: input.kind,
      ventureId: input.ventureId ?? null,
      batchId: input.batchId ?? null,
      payload: input.payload ?? {},
      at: input.at ?? this.clock(),
    });
  }

  /**
   * 业务写入时的事件必须挂到「当前 ISO 周批次」，否则周报按批次聚合会漏事件。
   * 只在写路径调用；读接口（state）不触发建批次。
   */
  private currentBatchId(at: string): string {
    return this.batches.ensureCurrent(this.id("vgb"), at).id;
  }

  /* ==================== 读取 ==================== */

  listVentures(filter: VentureFilter = {}): Venture[] {
    return this.ventures.list(filter);
  }

  requireVenture(id: string): Venture {
    const venture = this.ventures.get(id);
    if (venture === null) throw new ServiceError("not_found", `Venture 不存在：${id}`, 404);
    return venture;
  }

  getVentureDetail(id: string): VentureDetail {
    const venture = this.requireVenture(id);
    const latest = this.scores.latestFor(id);
    return {
      venture,
      parent: venture.parentId === null ? null : this.ventures.get(venture.parentId),
      children: this.ventures.children(id),
      evidences: this.evidences.listByVenture(id),
      scores: this.scores.listByVenture(id),
      links: this.links.listForVenture(id),
      latestScore:
        latest === null
          ? null
          : { score: latest.score, trend: latest.trend, at: latest.createdAt },
    };
  }

  getGraph(): BuildGraphResult {
    const latest = new Map<string, { score: number; trend: Trend }>();
    for (const [ventureId, record] of this.scores.latestAll()) {
      latest.set(ventureId, { score: record.score, trend: record.trend });
    }
    return buildGraph({
      ventures: this.ventures.list(),
      links: this.links.listAll(),
      latestScores: latest,
    });
  }

  timeline(range: { from?: string; to?: string; limit?: number } = {}): TimelineItem[] {
    const titles = new Map(this.ventures.list().map((venture) => [venture.id, venture.title]));
    return this.events.list(range).map((event) => ({
      ...event,
      ventureTitle: event.ventureId === null ? null : (titles.get(event.ventureId) ?? null),
    }));
  }

  searchIndex(): SearchIndex {
    return {
      ventures: this.ventures.list().map((venture) => ({
        id: venture.id,
        title: venture.title,
        summary: venture.summary,
        hypothesis: venture.hypothesis,
        tags: venture.tags,
      })),
      evidences: this.evidences.listAll().map((evidence) => ({
        id: evidence.id,
        ventureId: evidence.ventureId,
        sourceTitle: evidence.sourceTitle,
        abstract: evidence.abstract,
        tags: evidence.tags,
      })),
      documents: this.documents.list().map((document) => ({
        id: document.id,
        slug: document.slug,
        title: document.title,
        bodyMd: document.bodyMd,
      })),
    };
  }

  state(): StatePayload {
    const counts = this.ventures.countByStatus();
    const current = this.batches.getByName(this.currentBatchName());
    return {
      instance: this.instanceName,
      counts: { total: this.ventures.count(), ...counts },
      batchCount: this.batches.list().length,
      documentCount: this.documents.count(),
      eventCount: this.events.count(),
      pendingProposals: this.proposals.countPending(),
      currentBatch: current,
      latestReadyBatch: this.batches.latestReady(),
      recentEvents: this.timeline({ limit: 8 }),
      recentVentures: [...this.ventures.list()].slice(-8).reverse(),
      llm: describeLlm(),
      email: describeEmail(),
    };
  }

  private currentBatchName(): string {
    // 只读口径：不创建批次（state 是读接口）
    return isoWeekInfo(new Date(this.clock())).name;
  }

  /* ==================== Venture ==================== */

  createVenture(input: CreateVentureInput): Venture {
    const validation = validateVentureInput(input as unknown as Record<string, unknown>);
    if (!validation.ok) throw new ServiceError("validation", validation.errors.join("; "), 422);
    const parentId = input.parentId ?? null;
    if (parentId !== null && this.ventures.get(parentId) === null) {
      throw new ServiceError("validation", `父分支不存在：${parentId}`, 422);
    }
    const at = this.clock();
    const id = this.id("vg");
    const venture = this.ventures.insert({
      id,
      title: input.title.trim(),
      summary: input.summary?.trim() ?? "",
      hypothesis: input.hypothesis ?? "",
      parentId,
      status: input.status ?? "active",
      tags: normalizeTags(input.tags),
      forkOrigin: null,
      at,
    });
    this.appendEvent({
      kind: "venture_added",
      ventureId: id,
      batchId: this.currentBatchId(at),
      payload: { title: venture.title, parentId },
      at,
    });
    return venture;
  }

  updateVenture(
    id: string,
    patch: { title?: string; summary?: string; hypothesis?: string; status?: VentureStatus; tags?: string[] },
  ): Venture {
    const current = this.requireVenture(id);
    if (patch.status !== undefined) {
      const validation = validateVentureInput({ title: current.title, status: patch.status });
      if (!validation.ok) throw new ServiceError("validation", validation.errors.join("; "), 422);
    }
    if (patch.title !== undefined) {
      const validation = validateVentureInput({ title: patch.title });
      if (!validation.ok) throw new ServiceError("validation", validation.errors.join("; "), 422);
    }
    const at = this.clock();
    const updated = this.ventures.update(
      id,
      {
        ...patch,
        ...(patch.tags === undefined ? {} : { tags: normalizeTags(patch.tags) }),
      },
      at,
    );
    if (updated === null) throw new ServiceError("not_found", `Venture 不存在：${id}`, 404);
    if (patch.status !== undefined && patch.status !== current.status) {
      this.appendEvent({
        kind: "status_changed",
        ventureId: id,
        batchId: this.currentBatchId(at),
        payload: { from: current.status, to: patch.status },
        at,
      });
    }
    return updated;
  }

  forkVenture(parentId: string, input: CreateVentureInput): Venture {
    const parent = this.requireVenture(parentId);
    const child = this.createVenture({ ...input, parentId: parent.id });
    this.appendEvent({
      kind: "venture_forked",
      ventureId: child.id,
      payload: { from: parent.id, title: child.title },
      at: this.clock(),
    });
    return child;
  }

  /* ==================== 证据 ==================== */

  addEvidence(ventureId: string, input: CreateEvidenceInput): Evidence {
    this.requireVenture(ventureId);
    const validation = validateEvidenceInput({
      sourceTitle: input.sourceTitle,
      rawText: input.abstract,
      tags: input.tags,
    });
    if (!validation.ok) throw new ServiceError("validation", validation.errors.join("; "), 422);
    if (input.abstract.trim() === "") {
      throw new ServiceError("llm_required", "证据摘要不能为空：摘要必须由大模型生成", 503);
    }
    if (input.documentId != null && this.documents.get(input.documentId) === null) {
      throw new ServiceError("validation", `关联文档不存在：${input.documentId}`, 422);
    }
    const at = this.clock();
    const id = this.id("vge");
    const run = this.db.transaction(() => {
      const evidence = this.evidences.insert({
        id,
        ventureId,
        sourceTitle: input.sourceTitle.trim(),
        sourceUrl: input.sourceUrl ?? null,
        abstract: input.abstract.trim(),
        abstractSource: input.abstractSource ?? "llm",
        tags: normalizeTags(input.tags),
        documentId: input.documentId ?? null,
        at,
      });
      this.appendEvent({
        kind: "evidence_added",
        ventureId,
        batchId: this.currentBatchId(at),
        payload: { evidenceId: id, sourceTitle: evidence.sourceTitle },
        at,
      });
      return evidence;
    });
    return run();
  }

  updateEvidenceAbstract(evidenceId: string, abstract: string): Evidence {
    if (abstract.trim() === "") {
      throw new ServiceError("validation", "摘要不能为空", 422);
    }
    const updated = this.evidences.updateAbstract(evidenceId, abstract.trim());
    if (updated === null) throw new ServiceError("not_found", `证据不存在：${evidenceId}`, 404);
    return updated;
  }

  /* ==================== 打分 ==================== */

  addScore(ventureId: string, input: CreateScoreInput): ScoreRecord {
    this.requireVenture(ventureId);
    const validation = validateScoreInput(input as unknown as Record<string, unknown>);
    if (!validation.ok) throw new ServiceError("validation", validation.errors.join("; "), 422);

    const at = this.clock();
    const batch =
      input.batchId !== undefined && input.batchId !== ""
        ? this.batches.get(input.batchId)
        : this.batches.ensureCurrent(this.id("vgb"), at);
    if (batch === null) throw new ServiceError("validation", `批次不存在：${input.batchId}`, 422);

    // 证据引用优先校验（语义错误比重复打分更具体）
    const refs = input.evidenceRefs ?? [];
    if (refs.length > 0) {
      const owned = new Set(this.evidences.listByVenture(ventureId).map((evidence) => evidence.id));
      const foreign = refs.filter((ref) => !owned.has(ref));
      if (foreign.length > 0) {
        throw new ServiceError(
          "validation",
          `证据引用必须属于同一 Venture：${foreign.join(", ")}`,
          422,
        );
      }
    }

    // 一个批次内每条 Venture 只允许一条打分记录（append-only 语义下不做就地修改）
    const alreadyScored = this.scores
      .listByBatch(batch.id)
      .some((record) => record.ventureId === ventureId);
    if (alreadyScored) {
      throw new ServiceError(
        "conflict",
        "该 Venture 在本批次已有打分记录；如需调整请在新批次中打分",
        409,
      );
    }

    const previous = this.scores.previousBefore(ventureId, batch.startTime);
    const trend = computeTrend(input.score, previous);
    const id = this.id("vgs");

    const run = this.db.transaction(() => {
      const record = this.scores.insert({
        id,
        ventureId,
        batchId: batch.id,
        score: input.score,
        comment: input.comment.trim(),
        trend,
        evidenceRefs: refs,
        at,
      });
      this.appendEvent({
        kind: "score_changed",
        ventureId,
        batchId: batch.id,
        payload: {
          scoreId: id,
          score: input.score,
          previousScore: previous,
          trend,
          evidenceCount: refs.length,
        },
        at,
      });
      return record;
    });
    return run();
  }

  /* ==================== 关联 ==================== */

  addLink(input: CreateLinkInput): VentureLink {
    const validation = validateLinkInput(input as unknown as Record<string, unknown>);
    if (!validation.ok) throw new ServiceError("validation", validation.errors.join("; "), 422);
    this.requireVenture(input.fromVentureId);
    this.requireVenture(input.toVentureId);
    const at = this.clock();
    const id = this.id("vgl");
    const run = this.db.transaction(() => {
      const link = this.links.insert({
        id,
        fromVentureId: input.fromVentureId,
        toVentureId: input.toVentureId,
        relationType: input.relationType,
        note: input.note ?? null,
        at,
      });
      this.appendEvent({
        kind: "link_added",
        ventureId: input.fromVentureId,
        batchId: this.currentBatchId(at),
        payload: { linkId: id, to: input.toVentureId, relationType: input.relationType },
        at,
      });
      return link;
    });
    try {
      return run();
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        throw new ServiceError("conflict", "该关联已存在（同一对端点 + 同一关系类型）", 409);
      }
      throw error;
    }
  }

  /* ==================== 批次 / 周报 ==================== */

  listBatches(): Batch[] {
    return this.batches.list();
  }

  requireBatch(id: string): Batch {
    const batch = this.batches.get(id);
    if (batch === null) throw new ServiceError("not_found", `批次不存在：${id}`, 404);
    return batch;
  }

  ensureCurrentBatch(): Batch {
    return this.batches.ensureCurrent(this.id("vgb"), this.clock());
  }

  createBatch(input: { name: string; startTime: string; endTime: string }): Batch {
    if (input.name.trim() === "") throw new ServiceError("validation", "批次名不能为空", 422);
    if (this.batches.getByName(input.name) !== null) {
      throw new ServiceError("conflict", `批次名已存在：${input.name}`, 409);
    }
    return this.batches.create({
      id: this.id("vgb"),
      name: input.name.trim(),
      startTime: input.startTime,
      endTime: input.endTime,
      at: this.clock(),
    });
  }

  closeBatch(id: string): Batch {
    this.requireBatch(id);
    const closed = this.batches.close(id, this.clock());
    if (closed === null) throw new ServiceError("not_found", `批次不存在：${id}`, 404);
    return closed;
  }

  setBatchNote(id: string, note: string): Batch {
    this.requireBatch(id);
    const updated = this.batches.updateNote(id, note, this.clock());
    if (updated === null) throw new ServiceError("not_found", `批次不存在：${id}`, 404);
    return updated;
  }

  briefData(batchId: string): BriefData {
    const batch = this.requireBatch(batchId);
    const previousScores = new Map<string, number>();
    for (const score of this.scores.listByBatch(batchId)) {
      const previous = this.scores.previousBefore(score.ventureId, batch.startTime);
      if (previous !== null) previousScores.set(score.ventureId, previous);
    }
    return assembleBriefData({
      batch,
      ventures: this.ventures.list(),
      events: this.events.listByBatch(batchId),
      scores: this.scores.listByBatch(batchId),
      previousScores,
      evidences: this.evidences.listAll(),
      links: this.links.listAll(),
    });
  }

  markBriefGenerating(batchId: string): Batch {
    this.requireBatch(batchId);
    const updated = this.batches.updateBrief(batchId, { status: "generating" }, this.clock());
    if (updated === null) throw new ServiceError("not_found", `批次不存在：${batchId}`, 404);
    return updated;
  }

  saveBrief(batchId: string, content: string): Batch {
    const at = this.clock();
    const run = this.db.transaction(() => {
      const updated = this.batches.updateBrief(batchId, { status: "ready", content, error: null }, at);
      if (updated === null) throw new ServiceError("not_found", `批次不存在：${batchId}`, 404);
      this.appendEvent({
        kind: "brief_generated",
        batchId,
        payload: { chars: content.length },
        at,
      });
      return updated;
    });
    return run();
  }

  failBrief(batchId: string, error: string): Batch {
    const updated = this.batches.updateBrief(
      batchId,
      { status: "failed", content: "", error },
      this.clock(),
    );
    if (updated === null) throw new ServiceError("not_found", `批次不存在：${batchId}`, 404);
    return updated;
  }

  /* ==================== 文档 ==================== */

  listDocuments(kind?: DocumentKind): VgDocument[] {
    return this.documents.list(kind);
  }

  requireDocumentBySlug(slug: string): VgDocument {
    const document = this.documents.getBySlug(slug);
    if (document === null) throw new ServiceError("not_found", `文档不存在：${slug}`, 404);
    return document;
  }

  createDocument(input: {
    slug: string;
    title: string;
    kind: DocumentKind;
    bodyMd: string;
    sourceUrl?: string | null;
    ventureId?: string | null;
  }): VgDocument {
    const validation = validateDocumentInput(input as unknown as Record<string, unknown>);
    if (!validation.ok) throw new ServiceError("validation", validation.errors.join("; "), 422);
    if (this.documents.getBySlug(input.slug) !== null) {
      throw new ServiceError("conflict", `slug 已存在：${input.slug}`, 409);
    }
    if (input.ventureId != null) this.requireVenture(input.ventureId);
    const at = this.clock();
    const run = this.db.transaction(() => {
      const document = this.documents.insert({
        id: this.id("vgdoc"),
        slug: input.slug,
        title: input.title.trim(),
        kind: input.kind,
        bodyMd: input.bodyMd,
        sourceUrl: input.sourceUrl ?? null,
        ventureId: input.ventureId ?? null,
        at,
      });
      this.appendEvent({
        kind: "document_added",
        ventureId: document.ventureId,
        payload: { documentId: document.id, slug: document.slug, title: document.title },
        at,
      });
      return document;
    });
    return run();
  }

  updateDocument(
    id: string,
    patch: { title?: string; bodyMd?: string; kind?: DocumentKind; sourceUrl?: string | null },
  ): VgDocument {
    if (this.documents.get(id) === null) {
      throw new ServiceError("not_found", `文档不存在：${id}`, 404);
    }
    const updated = this.documents.update(id, patch, this.clock());
    if (updated === null) throw new ServiceError("not_found", `文档不存在：${id}`, 404);
    return updated;
  }

  /* ==================== 访客提案 ==================== */

  /** 访客提交（公开入口）；只落提案，不直接进图谱。 */
  submitProposal(input: {
    title: string;
    summary?: string;
    hypothesis: string;
    referencesText?: string;
    tags?: string[];
    submitter?: string | null;
    email: string;
  }): VentureProposal {
    const validation = validateProposalInput(input as unknown as Record<string, unknown>);
    if (!validation.ok) throw new ServiceError("validation", validation.errors.join("; "), 422);
    const at = this.clock();
    return this.proposals.insert({
      id: this.id("vgprop"),
      title: input.title.trim(),
      summary: input.summary?.trim() ?? "",
      hypothesis: input.hypothesis.trim(),
      referencesText: input.referencesText?.trim() ?? "",
      tags: normalizeTags(input.tags, 6),
      submitter:
        input.submitter === undefined || input.submitter === null || input.submitter.trim() === ""
          ? null
          : input.submitter.trim(),
      email: input.email.trim(),
      at,
    });
  }

  listProposals(status?: ProposalStatus): VentureProposal[] {
    return this.proposals.list(status);
  }

  requireProposal(id: string): VentureProposal {
    const proposal = this.proposals.get(id);
    if (proposal === null) throw new ServiceError("not_found", `提案不存在：${id}`, 404);
    return proposal;
  }

  /** 采纳：生成一条正式 Venture（默认根节点，可由管理员指定父分支）。 */
  acceptProposal(
    id: string,
    input: {
      parentId?: string | null;
      note?: string | null;
      reviewedBy?: string;
      tags?: string[];
    } = {},
  ): { proposal: VentureProposal; venture: Venture } {
    const proposal = this.requireProposal(id);
    if (proposal.status !== "pending") {
      throw new ServiceError("conflict", "该提案已处理过", 409);
    }
    const tags = normalizeTags([...(proposal.tags ?? []), ...(input.tags ?? [])], 8);
    const venture = this.createVenture({
      title: proposal.title,
      summary: proposal.summary,
      hypothesis: proposal.hypothesis,
      parentId: input.parentId ?? null,
      tags,
    });
    const updated = this.proposals.markAccepted(
      id,
      venture.id,
      input.note ?? null,
      input.reviewedBy ?? "ai",
      this.clock(),
    );
    if (updated === null) throw new ServiceError("internal", "提案状态写入失败", 500);
    return { proposal: updated, venture };
  }

  rejectProposal(id: string, note?: string | null, reviewedBy = "ai"): VentureProposal {
    const proposal = this.requireProposal(id);
    if (proposal.status !== "pending") {
      throw new ServiceError("conflict", "该提案已处理过", 409);
    }
    const updated = this.proposals.markRejected(id, note ?? null, reviewedBy, this.clock());
    if (updated === null) throw new ServiceError("internal", "提案状态写入失败", 500);
    return updated;
  }

  recordEmailLog(input: Omit<EmailLogRecord, "id" | "at"> & { at?: string }): EmailLogRecord {
    const record: EmailLogRecord = {
      ...input,
      id: this.id("vgemail"),
      at: input.at ?? this.clock(),
    };
    this.emailLog.record(record);
    return record;
  }

  listEmailLogs(limit = 100): EmailLogRecord[] {
    return this.emailLog.list(limit);
  }

  countPendingProposals(): number {
    return this.proposals.countPending();
  }

  /* ==================== 快照 / 备份 ==================== */

  exportSnapshot(options: { ventureIds?: string[] } = {}): SnapshotV1 {
    return createSnapshot(
      {
        ventures: this.ventures.list(),
        evidences: this.evidences.listAll(),
        links: this.links.listAll(),
        scores: this.scores.listAll(),
        batches: this.batches.list(),
        documents: this.documents.list(),
      },
      {
        snapshotId: this.id("vgsnap"),
        exportedAt: this.clock(),
        sourceInstance: this.instanceName,
        ...(options.ventureIds === undefined ? {} : { ventureIds: options.ventureIds }),
      },
    );
  }

  importSnapshot(raw: unknown): {
    forkOrigin: string;
    counts: { ventures: number; evidences: number; links: number; scores: number; batches: number; documents: number };
    warnings: string[];
  } {
    const validation = validateSnapshot(raw);
    if (!validation.ok) {
      throw new ServiceError("validation", validation.errors.join("; "), 422);
    }
    const at = this.clock();
    const plan = remapSnapshot(validation.snapshot, {
      targetLabel: this.instanceName,
      now: at,
      newId: this.makeId,
    });

    const run = this.db.transaction(() => {
      // 1) Ventures 先以 parent_id = NULL 插入，再回填父子，避免自引用外键顺序问题
      for (const venture of plan.ventures) {
        this.db
          .query(
            `INSERT INTO vg_venture
              (id, title, summary, hypothesis, parent_id, status, tags_json, fork_origin, created_at, updated_at)
             VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
          )
          .run(
            venture.id,
            venture.title,
            venture.summary,
            venture.hypothesis,
            venture.status,
            JSON.stringify(venture.tags),
            venture.forkOrigin,
            venture.createdAt,
            venture.updatedAt,
          );
      }
      for (const venture of plan.ventures) {
        if (venture.parentId === null) continue;
        this.db
          .query("UPDATE vg_venture SET parent_id = ? WHERE id = ?")
          .run(venture.parentId, venture.id);
      }

      // 2) 批次
      for (const batch of plan.batches) {
        this.db
          .query(
            `INSERT INTO vg_batch
              (id, name, start_at, end_at, status, brief_status, brief_content, brief_error, admin_note, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            batch.id,
            batch.name,
            batch.startTime,
            batch.endTime,
            batch.status,
            batch.briefStatus,
            batch.briefContent,
            batch.briefError,
            batch.adminNote,
            batch.createdAt,
            batch.updatedAt,
          );
      }

      // 3) 文档 → 4) 证据 → 5) 关联 → 6) 分数
      for (const document of plan.documents) {
        this.db
          .query(
            `INSERT INTO vg_document
              (id, slug, title, kind, body_md, source_url, venture_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            document.id,
            document.slug,
            document.title,
            document.kind,
            document.bodyMd,
            document.sourceUrl,
            document.ventureId,
            document.createdAt,
            document.updatedAt,
          );
      }
      for (const evidence of plan.evidences) {
        this.db
          .query(
            `INSERT INTO vg_evidence
              (id, venture_id, source_title, source_url, abstract, abstract_source, tags_json, document_id, added_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            evidence.id,
            evidence.ventureId,
            evidence.sourceTitle,
            evidence.sourceUrl,
            evidence.abstract,
            evidence.abstractSource,
            JSON.stringify(evidence.tags),
            evidence.documentId,
            evidence.addedAt,
          );
      }
      for (const link of plan.links) {
        this.db
          .query(
            `INSERT INTO vg_link (id, from_venture_id, to_venture_id, relation_type, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(link.id, link.fromVentureId, link.toVentureId, link.relationType, link.note, link.createdAt);
      }
      for (const score of plan.scores) {
        this.db
          .query(
            `INSERT INTO vg_score
              (id, venture_id, batch_id, score, comment, trend, evidence_refs_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            score.id,
            score.ventureId,
            score.batchId,
            score.score,
            score.comment,
            score.trend,
            JSON.stringify(score.evidenceRefs),
            score.createdAt,
          );
      }

      for (const venture of plan.ventures) {
        this.appendEvent({
          kind: "venture_forked",
          ventureId: venture.id,
          payload: { forkOrigin: plan.forkOrigin },
          at,
        });
      }
    });
    run();

    return {
      forkOrigin: plan.forkOrigin,
      counts: {
        ventures: plan.ventures.length,
        evidences: plan.evidences.length,
        links: plan.links.length,
        scores: plan.scores.length,
        batches: plan.batches.length,
        documents: plan.documents.length,
      },
      warnings: plan.warnings,
    };
  }

  backupBytes(): Uint8Array {
    return this.db.serialize();
  }

  /* ==================== Agent 运行记录 ==================== */

  startRun(kind: string, batchId: string | null): VgRun {
    return this.runs.create({ id: this.id("vgrun"), kind, batchId, at: this.clock() });
  }

  finishRun(
    id: string,
    patch: { status: "success" | "failed" | "aborted"; error?: string | null; stats?: Record<string, unknown> },
  ): VgRun | null {
    return this.runs.finish(id, { ...patch, at: this.clock() });
  }

  recordLlmCall(input: Omit<LlmCallRecord, "id" | "at"> & { at?: string }): LlmCallRecord {
    const record: LlmCallRecord = {
      ...input,
      id: this.id("vgllm"),
      at: input.at ?? this.clock(),
    };
    this.llmCalls.record(record);
    return record;
  }

  exportVentureMarkdown(id: string): string {
    const detail = this.getVentureDetail(id);
    const lines: string[] = [];
    lines.push(`# ${detail.venture.title}`, "");
    lines.push(`- 状态：${detail.venture.status}`);
    lines.push(`- 创建时间：${detail.venture.createdAt}`);
    if (detail.parent !== null) lines.push(`- 父分支：${detail.parent.title}`);
    if (detail.venture.tags.length > 0) lines.push(`- 标签：${detail.venture.tags.join(", ")}`);
    lines.push("");
    if (detail.venture.summary.trim() !== "") {
      lines.push("## 摘要", "", detail.venture.summary.trim(), "");
    }
    lines.push("## 猜想正文", "", detail.venture.hypothesis.trim() === "" ? "（无）" : detail.venture.hypothesis, "");
    lines.push("## 证据");
    if (detail.evidences.length === 0) lines.push("（无）");
    else {
      for (const evidence of detail.evidences) {
        const url = evidence.sourceUrl ? ` <${evidence.sourceUrl}>` : "";
        lines.push(`- ${evidence.sourceTitle}${url}`);
        lines.push(`  - 摘要：${evidence.abstract}`);
      }
    }
    lines.push("");
    lines.push("## 分数历史");
    if (detail.scores.length === 0) lines.push("（无）");
    else {
      for (const score of detail.scores) {
        lines.push(
          `- ${score.createdAt.slice(0, 10)} / ${score.score} / ${score.trend} / ${score.comment}`,
        );
      }
    }
    lines.push("");
    return lines.join("\n");
  }
}