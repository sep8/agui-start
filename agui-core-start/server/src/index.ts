// server/src/index.ts
import express from "express";
import cors from "cors";

// 关键：用 core 的类型来约束你的事件 shape（名字以你装到的版本为准）
import type { BaseEvent } from "@ag-ui/core";

const app = express();
app.use(cors());

function sseWrite(res: express.Response, event: BaseEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

app.get("/agui", async (req, res) => {
  // SSE headers
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const runId = `run_${Date.now()}`;

  // 1) run.start
  sseWrite(res, { type: "run.start", runId } as any);

  // 2) 模拟一点“思考”
  await new Promise(r => setTimeout(r, 300));
  sseWrite(res, { type: "run.status", runId, status: "building_ui" } as any);

  // 3) ui.snapshot（Open-JSON-UI payload）
  const ui = {
    type: "page",
    children: [
      {
        type: "card",
        title: "AG-UI + Open-JSON-UI Demo",
        children: [
          { type: "text", value: "这是一份一次性 UI snapshot（非增量）。" },
          { type: "button", label: "点我", action: { type: "alert", message: "Hello from Open-JSON-UI" } }
        ]
      }
    ]
  };

  await new Promise(r => setTimeout(r, 300));
  sseWrite(res, { type: "ui.snapshot", runId, ui } as any);

  // 4) run.complete
  await new Promise(r => setTimeout(r, 200));
  sseWrite(res, { type: "run.complete", runId } as any);

  // 结束 SSE（demo 简化）
  res.end();
});

app.listen(3001, () => {
  console.log("SSE server on http://localhost:3001/agui");
});