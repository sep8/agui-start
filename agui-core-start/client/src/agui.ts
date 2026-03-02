import { EventType } from "@ag-ui/core";
import type { BaseEvent } from "@ag-ui/core";

export type AGUIEvent = BaseEvent & Record<string, unknown>;

export function subscribeSSE(url: string, onEvent: (e: AGUIEvent) => void) {
  const es = new EventSource(url);

  es.onmessage = (msg) => {
    const e = JSON.parse(msg.data) as AGUIEvent;
    onEvent(e);
  };

  es.onerror = () => {
    // demo：出错就关
    es.close();
  };

  return () => es.close();
}

export function isLifecycleEvent(e: AGUIEvent) {
  return (
    e.type === EventType.RUN_STARTED ||
    e.type === EventType.RUN_FINISHED ||
    e.type === EventType.RUN_ERROR ||
    e.type === EventType.STEP_STARTED ||
    e.type === EventType.STEP_FINISHED
  );
}