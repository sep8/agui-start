import { useEffect, useState } from "react";
import type { OJNode } from "./openJsonUi";
import { renderNode } from "./renderer";
import { subscribeAGUI, type DemoEvent } from "./agui";

export default function App() {
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [ui, setUI] = useState<OJNode | null>(null);

  useEffect(() => {
    return subscribeAGUI("http://localhost:3001/agui", (e) => {
      setEvents((prev) => [...prev, e]);
      if (e.type === "ui.snapshot") setUI(e.ui);
    });
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: 16 }}>
      <div>
        <h3>AG-UI Timeline</h3>
        <pre style={{ background: "#f6f6f6", color: "#000", padding: 12, borderRadius: 12, overflow: "auto" }}>
          {events.map((e, i) => `${i + 1}. ${JSON.stringify(e)}\n`).join("")}
        </pre>
      </div>

      <div>
        <h3>Rendered Open-JSON-UI</h3>
        <div style={{ background: "#fff", color: "#000", padding: 12, borderRadius: 12 }}>
          {ui ? renderNode(ui) : <div>Waiting for ui.snapshot…</div>}
        </div>
      </div>
    </div>
  );
}