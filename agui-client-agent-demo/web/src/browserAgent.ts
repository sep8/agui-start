import {
  EventType,
  type RunAgentInput,
  type Message,
  type State,
  type RunStartedEvent,
  type RunFinishedEvent,
  type TextMessageStartEvent,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
} from "@ag-ui/core";
import type { AgentSubscriber, AbstractAgent } from "@ag-ui/client";

function uuid() {
  return crypto.randomUUID();
}

export class BrowserAgent {
  public messages: Message[] = [];
  public state: State = {};

  private llmUrl: string;
  constructor(llmUrl: string) {
    this.llmUrl = llmUrl;
  }

  private makeCtx(input: RunAgentInput) {
    return {
      agent: this as unknown as AbstractAgent,
      messages: this.messages,
      state: this.state,
      input,
    };
  }

  async run(subscriber: AgentSubscriber) {
    const threadId = uuid();
    const runId = uuid();
    const messageId = uuid();

    // 这次 run 的 input（尽量贴近 RunAgentInput）
    const input: RunAgentInput = {
      threadId,
      runId,
      messages: this.messages,
      state: this.state,
      tools: [],
      context: [],
      // tools/context 等如果你后续要用再加
    };

    const ctx = this.makeCtx(input);

    const runStartedEvent: RunStartedEvent = {
      type: EventType.RUN_STARTED,
      threadId,
      runId,
      timestamp: Date.now(),
    };
    subscriber.onRunStartedEvent?.({
      ...ctx,
      event: runStartedEvent,
    });

    const textStartEvent: TextMessageStartEvent = {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: "assistant",
      timestamp: Date.now(),
    };
    subscriber.onTextMessageStartEvent?.({
      ...ctx,
      event: textStartEvent,
    });

    const lastUser = this.messages.at(-1);
    const prompt = lastUser?.content ?? "";

    // 连接服务端“LLM”（SSE token 流）
    const resp = await fetch(this.llmUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ prompt }),
    });

    if (!resp.body) throw new Error("No response body (ReadableStream not supported?)");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    let assistantText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const idx = buffer.indexOf("\n\n");
        if (idx === -1) break;

        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const dataLine = chunk
          .split("\n")
          .map((s) => s.trim())
          .find((s) => s.startsWith("data:"));

        if (!dataLine) continue;

        const payload = JSON.parse(dataLine.slice(5).trim()) as { token?: string; done?: boolean };
        if (payload.done) break;

        const token = payload.token ?? "";
        assistantText += token;

        const textContentEvent: TextMessageContentEvent = {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: token,
          timestamp: Date.now(),
        };
        subscriber.onTextMessageContentEvent?.({
          ...ctx,
          event: textContentEvent,
          textMessageBuffer: assistantText,
        });
      }
    }

    const textEndEvent: TextMessageEndEvent = {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
      timestamp: Date.now(),
    };
    subscriber.onTextMessageEndEvent?.({
      ...ctx,
      event: textEndEvent,
      textMessageBuffer: assistantText,
    });

    // 写回消息（Agent 在浏览器维护对话）
    this.messages.push({ id: messageId, role: "assistant", content: assistantText });

    const runFinishedEvent: RunFinishedEvent = {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      timestamp: Date.now(),
      result: { ok: true },
    };
    subscriber.onRunFinishedEvent?.({
      ...ctx,
      event: runFinishedEvent,
      result: { ok: true },
    });
  }
}
