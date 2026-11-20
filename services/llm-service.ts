// modules/venture-grid/services/llm-service.ts
/**
 * 带审计的模型调用入口。所有成功/失败都落 vg_llm_call；
 * 失败一律抛 LlmError，绝不返回空串或占位内容。
 */
import { LlmError, isLlmError } from "../llm/errors";
import { sha256Hex } from "../llm/http";
import { buildEvidenceAbstractPrompt, buildWeeklyNarrativePrompt } from "../llm/prompts";
import { resolveProvider } from "../llm/registry";
import type { LlmProvider, LlmReply, LlmRequest } from "../llm/types";
import type { BriefData } from "../domain/types";
import type { VgService } from "./vg-service";

function promptHash(request: LlmRequest): string {
  return sha256Hex(`${request.system}\n\n---\n\n${request.user}`);
}

export async function chatRecorded(
  service: VgService,
  request: LlmRequest,
  providerOverride?: LlmProvider,
): Promise<LlmReply> {
  const startedAt = Date.now();
  const promptChars = request.system.length + request.user.length;
  const hash = promptHash(request);
  let providerId = "unknown";
  let model = "";
  try {
    const provider = providerOverride ?? resolveProvider();
    providerId = provider.id;
    model = provider.model;
    const reply = await provider.chat(request);
    service.recordLlmCall({
      provider: reply.provider,
      model: reply.model,
      purpose: request.purpose,
      status: "ok",
      errorCode: null,
      errorMessage: null,
      durationMs: reply.durationMs,
      promptChars: reply.promptChars,
      promptSha256: hash,
    });
    return reply;
  } catch (error) {
    const llmError = isLlmError(error)
      ? error
      : new LlmError("network", "大模型调用异常", error instanceof Error ? error.message : String(error));
    service.recordLlmCall({
      provider: providerId,
      model,
      purpose: request.purpose,
      status: "error",
      errorCode: llmError.code,
      errorMessage: llmError.toUserMessage().slice(0, 500),
      durationMs: Date.now() - startedAt,
      promptChars,
      promptSha256: hash,
    });
    throw llmError;
  }
}

export type EvidenceAbstractResult = {
  abstract: string;
  reply: LlmReply;
};

/** 证据摘要：失败抛错，调用方不得落库。 */
export async function generateEvidenceAbstract(
  service: VgService,
  input: {
    ventureTitle: string;
    sourceTitle: string;
    sourceUrl: string | null;
    rawText: string;
  },
  providerOverride?: LlmProvider,
): Promise<EvidenceAbstractResult> {
  const prompt = buildEvidenceAbstractPrompt(input);
  const reply = await chatRecorded(
    service,
    {
      system: prompt.system,
      user: prompt.user,
      purpose: "evidence-abstract",
      temperature: 0.2,
      maxTokens: 800,
    },
    providerOverride,
  );
  const abstract = reply.text.replace(/^```[a-zA-Z]*\s*|```$/g, "").trim();
  if (abstract === "") {
    throw new LlmError("bad_response", "模型返回空摘要");
  }
  return { abstract, reply };
}

/** 周报综述：失败抛错，批次必须标 failed。 */
export async function generateWeeklyNarrative(
  service: VgService,
  data: BriefData,
  providerOverride?: LlmProvider,
): Promise<{ narrative: string; reply: LlmReply }> {
  const prompt = buildWeeklyNarrativePrompt(data);
  const reply = await chatRecorded(
    service,
    {
      system: prompt.system,
      user: prompt.user,
      purpose: "weekly-brief-narrative",
      temperature: 0.3,
      maxTokens: 1200,
    },
    providerOverride,
  );
  const narrative = reply.text.replace(/^```[a-zA-Z]*\s*|```$/g, "").trim();
  if (narrative === "") {
    throw new LlmError("bad_response", "模型返回空综述");
  }
  return { narrative, reply };
}