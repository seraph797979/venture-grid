// modules/venture-grid/tests/fixtures/mock-llm.ts
/**
 * 本地「假大模型」：OpenAI 兼容 /v1/chat/completions。
 * 用途：在没有真实 API key 的环境里验证 VG 的完整链路（含 agent 工作流）。
 * 它只回两种文本：证据摘要、周报综述——由 system 提示词区分。
 */
const PORT = Number.parseInt(process.env.MOCK_LLM_PORT ?? "5288", 10);

type ChatBody = {
  model?: string;
  messages?: Array<{ role: string; content: string }>;
};

function pick(body: ChatBody): string {
  const system = body.messages?.find((message) => message.role === "system")?.content ?? "";
  if (system.includes("周报撰写人")) {
    return "本周新增的猜想集中在闭环与生理适应两条线上；分数变动幅度有限，但证据密度有所提升。物质闭环与能源自给之间的依赖关系仍然是主要约束，新增证据对既有判断提供了部分支撑。下一步值得关注的是低重力生理适应这条分支的证据补充。";
  }
  const user = body.messages?.find((message) => message.role === "user")?.content ?? "";
  const snippet = user.includes('"""') ? (user.split('"""')[1] ?? "").trim().slice(0, 60) : "";
  return `该来源围绕${snippet === "" ? "既定议题" : `「${snippet.replace(/\s+/g, " ")}」`}给出了可核验的描述，结论与现有判断方向一致，但样本范围有限，仍需更多独立来源交叉验证。`;
}

const server = Bun.serve({
  hostname: process.env.MOCK_LLM_HOST ?? "0.0.0.0",
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.endsWith("/chat/completions")) {
      return new Response("not found", { status: 404 });
    }
    const body = (await request.json()) as ChatBody;
    const content = pick(body);
    return Response.json({
      id: `mock-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: body.model ?? "mock",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 60, total_tokens: 160 },
    });
  },
});

console.log(`[mock-llm] listening on http://127.0.0.1:${server.port}/v1`);