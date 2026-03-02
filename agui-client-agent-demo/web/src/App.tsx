import { useRef, useState } from "react";
import type { AgentSubscriber } from "@ag-ui/client";
import { BrowserAgent } from "./browserAgent";

type ChatLine = { role: "user" | "assistant"; text: string };

export default function App() {
  const agentRef = useRef(
    new BrowserAgent("http://localhost:3001/llm")
  );

  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);

  // AG-UI subscriber：事件 → React state
  const subscriber: AgentSubscriber = {
    onTextMessageStartEvent() {
      setLines((prev) => [...prev, { role: "assistant", text: "" }]);
    },
    onTextMessageContentEvent({ event }) {
      setLines((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          ...next[next.length - 1],
          text: next[next.length - 1].text + event.delta,
        };
        return next;
      });
    },
  };

  const send = async () => {
    if (!input.trim() || running) return;

    setRunning(true);
    setLines((prev) => [...prev, { role: "user", text: input }]);

    agentRef.current.messages.push({
      id: crypto.randomUUID(),
      role: "user",
      content: input,
    });

    setInput("");
    await agentRef.current.run(subscriber);
    setRunning(false);
  };

  return (
    <div style={{ maxWidth: 760, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h2>AG-UI Demo (React)</h2>

      <div style={{ border: "1px solid #ddd", padding: 12, minHeight: 240 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ margin: "6px 0" }}>
            <b>{l.role}:</b> {l.text}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          style={{ flex: 1, padding: 8 }}
          placeholder="输入一句话"
        />
        <button onClick={send} disabled={running}>
          Send
        </button>
      </div>
    </div>
  );
}
