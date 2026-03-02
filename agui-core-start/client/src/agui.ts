// client/src/agui.ts
import type { OJNode } from "./openJsonUi";

export type DemoEvent =
  | { type: "run.start"; runId: string }
  | { type: "run.status"; runId: string; status: string }
  | { type: "ui.snapshot"; runId: string; ui: OJNode }
  | { type: "run.complete"; runId: string };

export function subscribeAGUI(url: string, onEvent: (e: DemoEvent) => void) {
  const es = new EventSource(url);

  es.onmessage = (msg) => {
    const e = JSON.parse(msg.data) as DemoEvent;
    onEvent(e);
  };

  es.onerror = () => {
    // demo：直接关闭
    es.close();
  };

  return () => es.close();
}