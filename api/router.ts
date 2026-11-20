// modules/venture-grid/api/router.ts
/**
 * /api/vg/** 唯一入口。
 * - 读接口公开；写接口必须过 adminGuard
 * - 错误统一映射：ServiceError → 其 status；LlmError → 503/502/429/504
 */
import path from "node:path";
import type { VgService } from "../services/vg-service";
import { ServiceError } from "../services/vg-service";
import { runWeeklyJob } from "../agent/weekly-job";
import { isLlmError } from "../llm/errors";
import { validateEvidenceInput } from "../domain/validation";
import { generateEvidenceAbstract } from "../services/llm-service";
import {
  API_PREFIX,
  adminGuard,
  errorResponse,
  isResponse,
  json,
  ok,
  queryInt,
  readJsonBody,
} from "./http";
import { allowRequest, clientKey } from "./rate-limit";

function mapError(error: unknown): Response {
  if (error instanceof ServiceError) {
    return errorResponse(error.status, error.code, error.message);
  }
  if (isLlmError(error)) {
    return errorResponse(error.status, `llm_${error.code}`, error.message, error.detail);
  }
  const message = error instanceof Error ? error.message : String(error);
  return errorResponse(500, "internal_error", message);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function tags(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export async function handleApi(request: Request, service: VgService): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const segments = url.pathname
    .slice(API_PREFIX.length)
    .split("/")
    .filter((part) => part !== "");

  try {
    if (segments.length === 0) {
      return errorResponse(404, "not_found", "未知 API 路径");
    }

    /* ==================== GET ==================== */
    if (method === "GET") {
      const [head, second, third] = segments;

      if (head === "health") {
        return json({ ok: true, service: "venture-grid", time: new Date().toISOString() });
      }

      if (head === "state") {
        return json(service.state());
      }

      if (head === "ventures" && segments.length === 1) {
        return json({
          ventures: service.listVentures({
            ...(url.searchParams.get("status") ? { status: url.searchParams.get("status") as never } : {}),
            ...(url.searchParams.get("tag") ? { tag: url.searchParams.get("tag") as never } : {}),
            ...(url.searchParams.get("batch") ? { batchId: url.searchParams.get("batch") as never } : {}),
          }),
        });
      }

      if (head === "ventures" && second !== undefined && segments.length === 2) {
        return json(service.getVentureDetail(decodeURIComponent(second)));
      }

      // 公开数据源：GET 直接读；缓存过期会自动出网拉取（force=1 需管理员）
      if (head === "ventures" && second !== undefined && third === "datasets") {
        const ventureId = decodeURIComponent(second);
        service.requireVenture(ventureId);
        const force = url.searchParams.get("force") === "1";
        if (force) {
          const guard = adminGuard(request);
          if (guard !== null) return guard;
        }
        const datasets = await service.datasets.listForDisplay(ventureId, force ? { force: true } : {});
        return json({ datasets });
      }

      if (head === "graph") {
        return json(service.getGraph());
      }

      if (head === "timeline") {
        return json({
          events: service.timeline({
            ...(url.searchParams.get("from") ? { from: url.searchParams.get("from") as string } : {}),
            ...(url.searchParams.get("to") ? { to: url.searchParams.get("to") as string } : {}),
            limit: queryInt(url, "limit", 200, 2000),
          }),
        });
      }

      if (head === "search-index") {
        return json(service.searchIndex());
      }

      if (head === "batches" && segments.length === 1) {
        return json({ batches: service.listBatches() });
      }

      if (head === "batches" && second === "current") {
        const current = service.state().currentBatch;
        return json({ batch: current });
      }

      if (head === "batches" && second !== undefined && segments.length === 2) {
        return json(service.requireBatch(decodeURIComponent(second)));
      }

      if (head === "batches" && second !== undefined && third === "brief") {
        const data = service.briefData(decodeURIComponent(second));
        return json({
          batch: data.batch,
          counts: {
            added: data.added.length,
            scoreChanges: data.scoreChanges.length,
            evidences: data.evidences.length,
            links: data.links.length,
          },
          data,
          runs: service.runs.listByBatch(decodeURIComponent(second)),
        });
      }

      if (head === "proposals") {
          const guard = adminGuard(request);
          if (guard !== null) return guard;
          const status = url.searchParams.get("status");
          return json({
            proposals: service.listProposals(status === null ? undefined : (status as never)),
            pending: service.countPendingProposals(),
            emailLogs: service.listEmailLogs(100),
          });
        }

      if (head === "documents" && segments.length === 1) {
        const kind = url.searchParams.get("kind");
        return json({
          documents: service.listDocuments(kind === null ? undefined : (kind as never)),
        });
      }

      if (head === "documents" && second !== undefined) {
        return json(service.requireDocumentBySlug(decodeURIComponent(second)));
      }

      if (head === "runs") {
        const batchId = url.searchParams.get("batch");
        return json({
          runs:
            batchId === null
              ? service.runs.list(queryInt(url, "limit", 50, 500))
              : service.runs.listByBatch(batchId),
        });
      }

      if (head === "llm-calls") {
        return json({ calls: service.llmCalls.list(queryInt(url, "limit", 50, 500)) });
      }

      if (head === "backup") {
        const guard = adminGuard(request);
        if (guard !== null) return guard;
        const bytes = service.backupBytes();
        return new Response(bytes as unknown as BodyInit, {
          status: 200,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="vg-backup-${Date.now()}.sqlite"`,
            "Cache-Control": "no-store",
          },
        });
      }

      if (head === "admin" && second === "check") {
        const guard = adminGuard(request);
        if (guard !== null) return guard;
        return json({ ok: true });
      }

      if (head === "export" && second === "venture" && third !== undefined) {
        const id = decodeURIComponent(third.replace(/\.md$/i, ""));
        const markdown = service.exportVentureMarkdown(id);
        const venture = service.requireVenture(id);
        return new Response(markdown, {
          status: 200,
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="${encodeURIComponent(venture.title)}.md"`,
            "Cache-Control": "no-store",
          },
        });
      }

      if (head === "export" && second === "snapshot" && third !== undefined) {
        const raw = decodeURIComponent(third.replace(/\.json$/i, ""));
        const snapshot = service.exportSnapshot(raw === "all" ? {} : { ventureIds: [raw] });
        return new Response(JSON.stringify(snapshot, null, 2), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="vg-snapshot-${snapshot.snapshotId}.json"`,
            "Cache-Control": "no-store",
          },
        });
      }

      return errorResponse(404, "not_found", `未知读接口：${url.pathname}`);
    }

    /* ==================== 写接口统一闸门 ==================== */
    if (method === "POST" || method === "PATCH") {
      const [head, second, third] = segments;
      // 访客提案是唯一的公开写入口；其余写接口先过管理员闸门
      const publicProposal = method === "POST" && head === "proposals" && segments.length === 1;
      if (!publicProposal) {
        const guard = adminGuard(request);
        if (guard !== null) return guard;
      }

      const body = await readJsonBody(request);
      if (isResponse(body)) return body;

      /* ---------- POST ---------- */
      if (method === "POST") {
        // 访客提案（公开）：只落审核队列，不直接生成 Venture
        if (head === "proposals" && segments.length === 1) {
          if ((process.env.VG_PUBLIC_SUBMIT ?? "1").trim() === "0") {
            return errorResponse(403, "public_submit_disabled", "访客提交已关闭");
          }
          // 蜜罐字段：真人看不到，机器人常会填
          if (typeof body.website === "string" && body.website.trim() !== "") {
            return errorResponse(422, "validation", "提交被拒绝");
          }
          if (!allowRequest(`proposal:${clientKey(request)}`, 3, 60 * 60 * 1000)) {
            return errorResponse(429, "rate_limited", "提交过于频繁，请一小时后再试");
          }
          const proposal = service.submitProposal({
            title: str(body.title),
            hypothesis: str(body.hypothesis),
            ...(typeof body.summary === "string" ? { summary: body.summary } : {}),
            ...(typeof body.referencesText === "string" ? { referencesText: body.referencesText } : {}),
            ...(tags(body.tags) === undefined ? {} : { tags: tags(body.tags) as string[] }),
            submitter: strOrNull(body.submitter),
            email: str(body.email),
          });
          return json(
            {
              ok: true,
              proposal: {
                id: proposal.id,
                title: proposal.title,
                status: proposal.status,
                createdAt: proposal.createdAt,
              },
            },
            201,
          );
        }

        // 提案由每周 agent 自动审核；这里不提供人工采纳/拒绝入口
        if (head === "ventures" && segments.length === 1) {
          const venture = service.createVenture({
            title: str(body.title),
            ...(typeof body.summary === "string" ? { summary: body.summary } : {}),
            ...(typeof body.hypothesis === "string" ? { hypothesis: body.hypothesis } : {}),
            parentId: strOrNull(body.parentId),
            ...(typeof body.status === "string" ? { status: body.status as never } : {}),
            ...(tags(body.tags) === undefined ? {} : { tags: tags(body.tags) as string[] }),
          });
          return json({ ok: true, venture }, 201);
        }

        if (head === "ventures" && second !== undefined && third === "fork") {
          const venture = service.forkVenture(decodeURIComponent(second), {
            title: str(body.title),
            ...(typeof body.summary === "string" ? { summary: body.summary } : {}),
            ...(typeof body.hypothesis === "string" ? { hypothesis: body.hypothesis } : {}),
            ...(tags(body.tags) === undefined ? {} : { tags: tags(body.tags) as string[] }),
          });
          return json({ ok: true, venture }, 201);
        }

        if (head === "ventures" && second !== undefined && third === "evidences") {
          const ventureId = decodeURIComponent(second);
          const rawText = str(body.rawText);
          const validation = validateEvidenceInput({
            sourceTitle: body.sourceTitle,
            rawText,
            tags: body.tags,
          });
          if (!validation.ok) {
            return errorResponse(422, "validation", validation.errors.join("; "));
          }
          const venture = service.requireVenture(ventureId);
          // 先走模型；失败直接返回错误，证据不落库
          const generated = await generateEvidenceAbstract(service, {
            ventureTitle: venture.title,
            sourceTitle: str(body.sourceTitle).trim(),
            sourceUrl: strOrNull(body.sourceUrl),
            rawText,
          });
          const evidence = service.addEvidence(ventureId, {
            sourceTitle: str(body.sourceTitle).trim(),
            sourceUrl: strOrNull(body.sourceUrl),
            abstract: generated.abstract,
            ...(tags(body.tags) === undefined ? {} : { tags: tags(body.tags) as string[] }),
            documentId: strOrNull(body.documentId),
            abstractSource: "llm",
          });
          return json(
            {
              ok: true,
              evidence,
              llm: {
                provider: generated.reply.provider,
                model: generated.reply.model,
                durationMs: generated.reply.durationMs,
              },
            },
            201,
          );
        }

        if (head === "ventures" && second !== undefined && third === "scores") {
          const record = service.addScore(decodeURIComponent(second), {
            score: typeof body.score === "number" ? body.score : Number.NaN,
            comment: str(body.comment),
            ...(Array.isArray(body.evidenceRefs)
              ? { evidenceRefs: body.evidenceRefs.filter((ref): ref is string => typeof ref === "string") }
              : {}),
            ...(typeof body.batchId === "string" ? { batchId: body.batchId } : {}),
          });
          return json({ ok: true, score: record }, 201);
        }

        // 强制刷新公开数据（管理员；不受 6h 缓存限制）
        if (
          head === "ventures" &&
          second !== undefined &&
          third === "datasets" &&
          segments[3] !== undefined &&
          segments[4] === "refresh"
        ) {
          const ventureId = decodeURIComponent(second);
          const datasetId = decodeURIComponent(segments[3]);
          service.requireVenture(ventureId);
          if (service.datasets.get(ventureId, datasetId) === null) {
            return errorResponse(404, "not_found", `数据源不存在：${datasetId}`);
          }
          const dataset = await service.datasets.refresh(ventureId, datasetId);
          return json({ ok: true, dataset });
        }

        if (head === "links") {
          const link = service.addLink({
            fromVentureId: str(body.fromVentureId),
            toVentureId: str(body.toVentureId),
            relationType: body.relationType as never,
            note: strOrNull(body.note),
          });
          return json({ ok: true, link }, 201);
        }

        if (head === "batches" && segments.length === 1) {
          const batch = service.createBatch({
            name: str(body.name),
            startTime: str(body.startTime),
            endTime: str(body.endTime),
          });
          return json({ ok: true, batch }, 201);
        }

        if (head === "batches" && second === "current") {
          return json({ ok: true, batch: service.ensureCurrentBatch() }, 201);
        }

        if (head === "batches" && second !== undefined && third === "close") {
          return json({ ok: true, batch: service.closeBatch(decodeURIComponent(second)) });
        }

        if (head === "batches" && second !== undefined && third === "brief") {
          const result = await runWeeklyJob(service, { batchId: decodeURIComponent(second) });
          if (result.status !== "success") {
            return errorResponse(
              502,
              "brief_failed",
              result.error ?? "周报生成失败",
              { runId: result.runId, batchId: result.batchId },
            );
          }
          return json({
            ok: true,
            runId: result.runId,
            batchId: result.batchId,
            content: result.content,
          });
        }

        if (head === "snapshots" && second === "import") {
          const result = service.importSnapshot(body.snapshot ?? body);
          return json({ ok: true, ...result }, 201);
        }

        if (head === "documents") {
          const document = service.createDocument({
            slug: str(body.slug),
            title: str(body.title),
            kind: (body.kind ?? "guide") as never,
            bodyMd: str(body.bodyMd),
            sourceUrl: strOrNull(body.sourceUrl),
            ventureId: strOrNull(body.ventureId),
          });
          return json({ ok: true, document }, 201);
        }

        return errorResponse(404, "not_found", `未知写接口：${url.pathname}`);
      }

      /* ---------- PATCH ---------- */
      if (head === "ventures" && second !== undefined) {
        const venture = service.updateVenture(decodeURIComponent(second), {
          ...(typeof body.title === "string" ? { title: body.title } : {}),
          ...(typeof body.summary === "string" ? { summary: body.summary } : {}),
          ...(typeof body.hypothesis === "string" ? { hypothesis: body.hypothesis } : {}),
          ...(typeof body.status === "string" ? { status: body.status as never } : {}),
          ...(tags(body.tags) === undefined ? {} : { tags: tags(body.tags) as string[] }),
        });
        return json({ ok: true, venture });
      }

      if (head === "evidences" && second !== undefined) {
        const evidence = service.updateEvidenceAbstract(decodeURIComponent(second), str(body.abstract));
        return json({ ok: true, evidence });
      }

      if (head === "batches" && second !== undefined) {
        const batch = service.setBatchNote(decodeURIComponent(second), str(body.adminNote));
        return json({ ok: true, batch });
      }

      if (head === "documents" && second !== undefined) {
        const document = service.updateDocument(decodeURIComponent(second), {
          ...(typeof body.title === "string" ? { title: body.title } : {}),
          ...(typeof body.bodyMd === "string" ? { bodyMd: body.bodyMd } : {}),
          ...(typeof body.kind === "string" ? { kind: body.kind as never } : {}),
          ...(body.sourceUrl === null || typeof body.sourceUrl === "string"
            ? { sourceUrl: strOrNull(body.sourceUrl) }
            : {}),
        });
        return json({ ok: true, document });
      }

      return errorResponse(404, "not_found", `未知写接口：${url.pathname}`);
    }

    return errorResponse(405, "method_not_allowed", `不支持的方法：${method}`, {
      allow: ["GET", "POST", "PATCH"],
    });
  } catch (error) {
    return mapError(error);
  }
}

/** 静态资源的 SPA fallback 判定（serve.ts 用）。 */
export function isApiPath(pathname: string): boolean {
  return pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);
}

export function isAssetPath(pathname: string): boolean {
  return path.posix.extname(pathname) !== "";
}