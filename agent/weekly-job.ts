// modules/venture-grid/agent/weekly-job.ts
/**
 * 每周 agent 工作：用仓库的 L0 引擎（@gobing-ai/ts-dual-workflow-engine）编排，
 * 但不复制 agent-factory 的接线，也不引入 multi-agent-bus。
 *
 * 三个 Action 都以闭包持有本次 job 的状态；引擎只负责顺序、失败传播与 run 记录。
 */
import {
  MemoryWorkflowPersistenceAdapter,
  WorkflowService,
  createDefaultWorkflowEngineHost,
  type ActionResult,
  type ActionRunContext,
  type ActionRunner,
} from "@gobing-ai/ts-dual-workflow-engine";
import path from "node:path";
import { renderBriefMarkdown } from "../domain/brief";
import type { BriefData } from "../domain/types";
import { LlmError, isLlmError } from "../llm/errors";
import { resolveProvider } from "../llm/registry";
import type { LlmProvider } from "../llm/types";
import { generateWeeklyNarrative } from "../services/llm-service";
import { reviewPendingProposals, type ProposalReviewSummary } from "../services/proposal-review";
import { ServiceError, type VgService } from "../services/vg-service";

export const WEEKLY_WORKFLOW_PATH = path.join(import.meta.dir, "weekly-workflow.yaml");

export type WeeklyJobResult = {
  runId: string;
  batchId: string;
  status: "success" | "failed" | "aborted";
  content: string | null;
  error: string | null;
  data: BriefData;
};

type JobState = {
  batchId: string;
  data: BriefData | null;
  narrative: string | null;
  content: string | null;
  review: ProposalReviewSummary | null;
};

function fail(error: unknown): ActionResult {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
  return { ok: false, error: message };
}

function collectAction(service: VgService, state: JobState): ActionRunner {
  return {
    kind: "vg.weekly.collect",
    async execute(): Promise<ActionResult> {
      try {
        const batch = service.requireBatch(state.batchId);
        state.data = service.briefData(batch.id);
        return {
          ok: true,
          data: {
            batch: batch.name,
            added: state.data.added.length,
            scoreChanges: state.data.scoreChanges.length,
            evidences: state.data.evidences.length,
            links: state.data.links.length,
          },
        };
      } catch (error) {
        return fail(error);
      }
    },
  };
}

function reviewAction(service: VgService, state: JobState, provider: LlmProvider): ActionRunner {
  return {
    kind: "vg.weekly.review",
    async execute(): Promise<ActionResult> {
      try {
        const review = await reviewPendingProposals(service, { provider });
        state.review = review;
        return {
          ok: true,
          data: {
            reviewed: review.reviewed,
            accepted: review.accepted,
            rejected: review.rejected,
            emailSent: review.emailSent,
            emailFailed: review.emailFailed,
            failed: review.failed,
          },
        };
      } catch (error) {
        // 审核整体异常也不阻塞周报；记录在 stats 里
        state.review = null;
        return { ok: true, data: { error: error instanceof Error ? error.message : String(error) } };
      }
    },
  };
}

function composeAction(
  service: VgService,
  state: JobState,
  provider: LlmProvider,
): ActionRunner {
  return {
    kind: "vg.weekly.compose",
    async execute(): Promise<ActionResult> {
      if (state.data === null) return { ok: false, error: "collect 未产出数据" };
      try {
        const { narrative } = await generateWeeklyNarrative(service, state.data, provider);
        state.narrative = narrative;
        return { ok: true, data: { chars: narrative.length } };
      } catch (error) {
        return fail(error);
      }
    },
  };
}

function finalizeAction(service: VgService, state: JobState): ActionRunner {
  return {
    kind: "vg.weekly.finalize",
    async execute(_options: Record<string, unknown>, _context: ActionRunContext): Promise<ActionResult> {
      if (state.data === null) return { ok: false, error: "collect 未产出数据" };
      if (state.narrative === null) return { ok: false, error: "compose 未产出综述" };
      const markdown = renderBriefMarkdown(state.data, { narrative: state.narrative });
      try {
        service.saveBrief(state.batchId, markdown);
        state.content = markdown;
        return { ok: true, data: { chars: markdown.length } };
      } catch (error) {
        return fail(error);
      }
    },
  };
}

export type RunWeeklyJobOptions = {
  batchId: string;
  /** 测试注入：跳过环境解析 */
  provider?: LlmProvider;
  workflowPath?: string;
  runId?: string;
};

/**
 * 执行一次周报生成。
 * 关键顺序：
 *  1) 先预检 LLM（未配置直接抛 not_configured，**不**改批次状态、不建 run）
 *  2) 标记 generating + 建 run
 *  3) 跑引擎；成功落内容，失败落 brief_error 并清空内容
 */
export async function runWeeklyJob(
  service: VgService,
  options: RunWeeklyJobOptions,
): Promise<WeeklyJobResult> {
  const batch = service.requireBatch(options.batchId);
  const provider = options.provider ?? resolveProvider();

  service.markBriefGenerating(batch.id);
  const run = service.startRun("weekly_brief", batch.id);
  const state: JobState = { batchId: batch.id, data: null, narrative: null, content: null, review: null };

  const host = createDefaultWorkflowEngineHost();
  host.registerAction(collectAction(service, state));
  host.registerAction(reviewAction(service, state, provider));
  host.registerAction(composeAction(service, state, provider));
  host.registerAction(finalizeAction(service, state));
  const workflowService = new WorkflowService(host, new MemoryWorkflowPersistenceAdapter());

  try {
    const workflow = await workflowService.load(options.workflowPath ?? WEEKLY_WORKFLOW_PATH);
    const result = await workflowService.run(workflow, {
      runId: options.runId ?? run.id,
      vars: { batch_id: batch.id },
    });
    if (result.status !== "done" || state.content === null) {
      const reason = result.reason ?? "工作流未产出周报内容";
      service.failBrief(batch.id, reason);
      service.finishRun(run.id, {
        status: "failed",
        error: reason,
        stats: { transitions: result.transitionsTaken, finalState: result.finalState },
      });
      return {
        runId: run.id,
        batchId: batch.id,
        status: "failed",
        content: null,
        error: reason,
        data: state.data ?? service.briefData(batch.id),
      };
    }

    service.finishRun(run.id, {
      status: "success",
      stats: {
        transitions: result.transitionsTaken,
        finalState: result.finalState,
        chars: state.content.length,
        ...(state.review === null ? {} : { review: state.review }),
      },
    });
    return {
      runId: run.id,
      batchId: batch.id,
      status: "success",
      content: state.content,
      error: null,
      data: state.data!,
    };
  } catch (error) {
    const message = isLlmError(error)
      ? error.toUserMessage()
      : error instanceof ServiceError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    service.failBrief(batch.id, message);
    service.finishRun(run.id, { status: "failed", error: message });
    return {
      runId: run.id,
      batchId: batch.id,
      status: "failed",
      content: null,
      error: message,
      data: state.data ?? service.briefData(batch.id),
    };
  }
}

export { LlmError };