import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

function sseWrite(res: express.Response, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// 假 LLM：把 prompt 拼成一段回复，然后逐字流式输出
app.post("/llm", async (req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const prompt = String(req.body?.prompt ?? "");
  const reply = `（假LLM）我收到了你的输入：${prompt}。现在我以 SSE 流式输出。`;

  for (const ch of reply) {
    await sleep(20);
    // 这里服务端只输出“token”，不输出 AG-UI 事件
    sseWrite(res, { token: ch });
  }

  // done 信号
  sseWrite(res, { done: true });
  res.end();
});

app.listen(3001, () => {
  console.log("LLM stub listening on http://localhost:3001/llm");
});
