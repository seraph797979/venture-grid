// modules/venture-grid/domain/snapshot.ts
/**
 * Fork 快照：导出打包 / 导入重写。
 * 纯函数，不碰数据库；仓储层只负责把 ImportPlan 落库。
 */
import { defaultIdFactory, type IdFactory } from "./ids";
import type {
  Batch,
  Evidence,
  ScoreRecord,
  SnapshotV1,
  Venture,
  VentureLink,
  VgDocument,
} from "./types";

export const SNAPSHOT_SCHEMA = "vg-snapshot@1";

export type SnapshotSource = {
  ventures: Venture[];
  evidences: Evidence[];
  links: VentureLink[];
  scores: ScoreRecord[];
  batches: Batch[];
  documents: VgDocument[];
};

export type CreateSnapshotOptions = {
  snapshotId: string;
  exportedAt: string;
  sourceInstance: string;
  /** 指定则只导出这些 Venture（含其证据/分数/关联） */
  ventureIds?: string[];
};

function shortId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "fork";
}

/**
 * 导出快照。指定 ventureIds 时做子集裁剪：
 * - 只保留这些 Venture 的证据、分数
 * - 关联只保留两端都在子集内的
 * - 文档只保留被子集证据引用的
 */
export function createSnapshot(
  source: SnapshotSource,
  options: CreateSnapshotOptions,
): SnapshotV1 {
  const selected =
    options.ventureIds === undefined
      ? undefined
      : new Set(options.ventureIds.filter((id) => source.ventures.some((v) => v.id === id)));

  const ventures =
    selected === undefined ? source.ventures : source.ventures.filter((v) => selected.has(v.id));
  const keep = new Set(ventures.map((v) => v.id));

  const evidences = source.evidences.filter((e) => keep.has(e.ventureId));
  const documentIds = new Set(
    evidences.map((e) => e.documentId).filter((id): id is string => id !== null),
  );
  const documents = source.documents.filter((d) => documentIds.has(d.id));
  const links = source.links.filter(
    (l) => keep.has(l.fromVentureId) && keep.has(l.toVentureId),
  );
  const scores = source.scores.filter((s) => keep.has(s.ventureId));
  const batchIds = new Set(scores.map((s) => s.batchId));
  const batches = source.batches.filter((b) => batchIds.has(b.id));

  return {
    schema: SNAPSHOT_SCHEMA,
    snapshotId: options.snapshotId,
    exportedAt: options.exportedAt,
    sourceInstance: options.sourceInstance,
    ventures,
    evidences,
    links,
    scores,
    batches,
    documents,
  };
}

export type ImportPlan = {
  forkOrigin: string;
  ventures: Venture[];
  evidences: Evidence[];
  links: VentureLink[];
  scores: ScoreRecord[];
  batches: Batch[];
  documents: VgDocument[];
  /** oldId → newId（跨实体统一表，便于排查） */
  idMap: Record<string, string>;
  warnings: string[];
};

export type RemapOptions = {
  /** 导入目标标识（实例名 + 快照短 id），会写进每个 Venture 的 forkOrigin */
  targetLabel: string;
  now?: string;
  newId?: IdFactory;
};

/**
 * 导入重写：所有实体重新生成 id（避免与目标实例冲突），
 * 关联/父子/证据引用全部按映射重建，forkOrigin 统一标注。
 */
export function remapSnapshot(snapshot: SnapshotV1, options: RemapOptions): ImportPlan {
  const makeId = options.newId ?? defaultIdFactory;
  const now = options.now ?? new Date().toISOString();
  const forkOrigin = `${options.targetLabel}@${snapshot.snapshotId}`;
  const suffix = shortId(snapshot.snapshotId);
  const idMap: Record<string, string> = {};
  const warnings: string[] = [];

  const batchMap = new Map<string, string>();
  const batches: Batch[] = snapshot.batches.map((batch) => {
    const id = makeId("vgb");
    batchMap.set(batch.id, id);
    idMap[batch.id] = id;
    const baseName = `${batch.name} · fork-${suffix}`;
    return {
      ...batch,
      id,
      name: baseName,
      briefStatus: batch.briefStatus,
      updatedAt: now,
    };
  });

  const documentMap = new Map<string, string>();
  const documents: VgDocument[] = snapshot.documents.map((document) => {
    const id = makeId("vgdoc");
    documentMap.set(document.id, id);
    idMap[document.id] = id;
    return {
      ...document,
      id,
      slug: `${document.slug}-fork-${suffix}`,
      ventureId: null, // 等 venture 映射完成后回填
      updatedAt: now,
    };
  });

  const ventureMap = new Map<string, string>();
  const ventures: Venture[] = snapshot.ventures.map((venture) => {
    const id = makeId("vg");
    ventureMap.set(venture.id, id);
    idMap[venture.id] = id;
    return {
      ...venture,
      id,
      parentId: venture.parentId,
      forkOrigin,
      updatedAt: now,
    };
  });

  // 回填父子与文档归属
  const remappedVentures = ventures.map((venture) => {
    if (venture.parentId === null) return venture;
    const parent = ventureMap.get(venture.parentId);
    if (parent === undefined) {
      warnings.push(`父分支 ${venture.parentId} 不在快照内，已作为根节点导入`);
      return { ...venture, parentId: null };
    }
    return { ...venture, parentId: parent };
  });

  const remappedDocuments = documents.map((document) => {
    const original = snapshot.documents.find((d) => idMap[d.id] === document.id);
    const parent = original?.ventureId ? ventureMap.get(original.ventureId) : undefined;
    return { ...document, ventureId: parent ?? null };
  });

  const evidenceMap = new Map<string, string>();
  const evidences: Evidence[] = snapshot.evidences.map((evidence) => {
    const id = makeId("vge");
    evidenceMap.set(evidence.id, id);
    idMap[evidence.id] = id;
    const ventureId = ventureMap.get(evidence.ventureId);
    if (ventureId === undefined) {
      warnings.push(`证据 ${evidence.sourceTitle} 的 Venture 不在快照内，已跳过`);
    }
    return {
      ...evidence,
      id,
      ventureId: ventureId ?? "",
      documentId: evidence.documentId ? (documentMap.get(evidence.documentId) ?? null) : null,
    };
  }).filter((evidence) => evidence.ventureId !== "");

  const links: VentureLink[] = [];
  for (const link of snapshot.links) {
    const from = ventureMap.get(link.fromVentureId);
    const to = ventureMap.get(link.toVentureId);
    if (from === undefined || to === undefined) {
      warnings.push(`关联 ${link.fromVentureId} → ${link.toVentureId} 端点缺失，已跳过`);
      continue;
    }
    const id = makeId("vgl");
    idMap[link.id] = id;
    links.push({ ...link, id, fromVentureId: from, toVentureId: to });
  }

  const scores: ScoreRecord[] = [];
  for (const score of snapshot.scores) {
    const ventureId = ventureMap.get(score.ventureId);
    const batchId = batchMap.get(score.batchId);
    if (ventureId === undefined || batchId === undefined) {
      warnings.push(`分数记录 ${score.id} 归属缺失，已跳过`);
      continue;
    }
    const refs = score.evidenceRefs
      .map((ref) => evidenceMap.get(ref))
      .filter((ref): ref is string => ref !== undefined);
    if (refs.length !== score.evidenceRefs.length) {
      warnings.push(
        `分数记录 ${score.id} 有 ${score.evidenceRefs.length - refs.length} 条证据引用不在快照内，已剔除`,
      );
    }
    const id = makeId("vgs");
    idMap[score.id] = id;
    scores.push({ ...score, id, ventureId, batchId, evidenceRefs: refs });
  }

  return {
    forkOrigin,
    ventures: remappedVentures,
    evidences,
    links,
    scores,
    batches,
    documents: remappedDocuments,
    idMap,
    warnings,
  };
}

export type SnapshotValidation =
  | { ok: true; snapshot: SnapshotV1 }
  | { ok: false; errors: string[] };

/** 导入前的结构校验：只查必要形状，不做业务语义判断。 */
export function validateSnapshot(value: unknown): SnapshotValidation {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) {
    return { ok: false, errors: ["快照必须是 JSON 对象"] };
  }
  const record = value as Record<string, unknown>;
  if (record.schema !== SNAPSHOT_SCHEMA) {
    errors.push(`schema 必须是 ${SNAPSHOT_SCHEMA}`);
  }
  const arrays = ["ventures", "evidences", "links", "scores", "batches", "documents"] as const;
  for (const key of arrays) {
    if (!Array.isArray(record[key])) errors.push(`${key} 必须是数组`);
  }
  if (typeof record.snapshotId !== "string" || record.snapshotId === "") {
    errors.push("snapshotId 不能为空");
  }
  if (typeof record.sourceInstance !== "string") {
    errors.push("sourceInstance 必须是字符串");
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, snapshot: value as SnapshotV1 };
}