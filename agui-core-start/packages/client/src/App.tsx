import { useMemo, useRef, useState } from 'react'
import { EventType, type ActivityDeltaEvent, type ActivitySnapshotEvent } from '@ag-ui/core'
import type { AGUIEvent } from './agui'
import { subscribeSSE, isLifecycleEvent } from './agui'
import type { OJNode } from './openJsonUi'
import { renderNode } from './renderer'
import { applyJsonPatch } from './jsonPatch'

type Filter = 'lifecycle' | 'messages' | 'all'

function pretty(e: any) {
  return JSON.stringify(e, null, 2)
}

function clip(s: string, n = 20) {
  return s.length <= n ? s : s.slice(0, n) + '…'
}

function eventLabel(e: AGUIEvent) {
  switch (e.type) {
    case EventType.RUN_STARTED:
      return `RUN_STARTED (${e.runId})`
    case EventType.RUN_FINISHED:
      return `RUN_FINISHED (${e.runId})`
    case EventType.RUN_ERROR:
      return `RUN_ERROR (${e.runId})`
    case EventType.STEP_STARTED:
      return `STEP_STARTED (${e.stepName ?? e.stepId ?? ''})`
    case EventType.STEP_FINISHED:
      return `STEP_FINISHED (${e.stepName ?? e.stepId ?? ''})`

    case EventType.TEXT_MESSAGE_START:
      return `TEXT_MESSAGE_START (${e.messageId ?? ''})`
    case EventType.TEXT_MESSAGE_CHUNK:
      return `TEXT_MESSAGE_CHUNK "${clip((e.delta as string) ?? '')}"`
    case EventType.TEXT_MESSAGE_CONTENT:
      return `TEXT_MESSAGE_CONTENT "${clip((e.delta as string) ?? '')}"`
    case EventType.TEXT_MESSAGE_END:
      return `TEXT_MESSAGE_END (${e.messageId ?? ''})`
    case EventType.TOOL_CALL_START:
      return `TOOL_CALL_START (${e.toolCallName ?? ''})`
    case EventType.TOOL_CALL_CHUNK:
      return `TOOL_CALL_CHUNK "${clip((e.delta as string) ?? '')}"`
    case EventType.TOOL_CALL_ARGS:
      return `TOOL_CALL_ARGS "${clip((e.delta as string) ?? '')}"`
    case EventType.TOOL_CALL_END:
      return `TOOL_CALL_END (${e.toolCallId ?? ''})`
    case EventType.TOOL_CALL_RESULT:
      return `TOOL_CALL_RESULT (${e.toolCallId ?? ''})`
    case EventType.ACTIVITY_SNAPSHOT:
      return `ACTIVITY_SNAPSHOT (${e.activityType ?? ''})`
    case EventType.ACTIVITY_DELTA:
      return `ACTIVITY_DELTA (${e.activityType}) ops=${((e.patch as any[]) ?? [])?.length ?? 0}`

    default:
      return String(e.type)
  }
}

function isTextMessageEvent(e: AGUIEvent) {
  return e.type === EventType.TEXT_MESSAGE_START || e.type === EventType.TEXT_MESSAGE_CONTENT || e.type === EventType.TEXT_MESSAGE_END || e.type === EventType.TEXT_MESSAGE_CHUNK
}

export default function App() {
  const [streamEnabled, setStreamEnabled] = useState(false)
  const [events, setEvents] = useState<AGUIEvent[]>([])
  const [filter, setFilter] = useState<Filter>('lifecycle')
  const [connected, setConnected] = useState(false)
  const [ui, setUI] = useState<OJNode | null>(null)

  const unsubRef = useRef<null | (() => void)>(null)

  const shown = useMemo(() => {
    if (filter === 'all') return events
    if (filter === 'messages') return events.filter(isTextMessageEvent)
    return events.filter(isLifecycleEvent)
  }, [events, filter])

  function connect(mode: 'success' | 'error') {
    // reset + reconnect
    unsubRef.current?.()
    setEvents([])
    setConnected(true)

    const url = `http://localhost:3001/agui/lifecycle?mode=${mode}&stream=${streamEnabled}`
    unsubRef.current = subscribeSSE(url, (e) => {
      setEvents((prev) => [...prev, e])

      if (e.type === EventType.ACTIVITY_SNAPSHOT) {
        if ((e as ActivitySnapshotEvent).activityType === 'OPEN_JSON_UI') {
          setUI(e.content as OJNode)
        }
      }

      if (e.type === EventType.ACTIVITY_DELTA) {
        const d = e as ActivityDeltaEvent
        if (d.activityType === 'OPEN_JSON_UI') {
          setUI((prev) => (prev ? applyJsonPatch(prev, d.patch) : prev))
        }
      }

      // run end 自动断开（体验更像“一次 run”）
      if (e.type === EventType.RUN_FINISHED || e.type === EventType.RUN_ERROR) {
        unsubRef.current?.()
        unsubRef.current = null
        setConnected(false)
      }
    })
  }

  function disconnect() {
    unsubRef.current?.()
    unsubRef.current = null
    setConnected(false)
  }

  return (
    <div style={{ padding: 16, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h2 style={{ marginTop: 0 }}>AG-UI Lifecycle Timeline (Demo)</h2>

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button disabled={connected} onClick={() => connect('success')}>
          Run Success
        </button>
        <button disabled={connected} onClick={() => connect('error')}>
          Run Error
        </button>
        <button disabled={!connected} onClick={disconnect}>
          Disconnect
        </button>

        <span style={{ marginLeft: 12 }}>Filter:</span>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="lifecycle">Lifecycle only</option>
          <option value="messages">Text messages only</option>
          <option value="all">All</option>
        </select>

        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={streamEnabled} onChange={(e) => setStreamEnabled(e.target.checked)} disabled={connected} />
          Stream
        </label>

        <span style={{ marginLeft: 12, opacity: 0.7 }}>Status: {connected ? 'streaming...' : 'idle'}</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '420px 1fr 1fr',
          gap: 16,
          marginTop: 16,
        }}
      >
        <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Timeline</div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {shown.map((e, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                <code>{eventLabel(e)}</code>
              </li>
            ))}
          </ol>
        </div>

        <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Event details</div>
          <pre
            style={{
              margin: 0,
              background: '#f6f6f6',
              color: '#333',
              padding: 12,
              borderRadius: 12,
              maxHeight: 520,
              overflow: 'auto',
            }}
          >
            {shown.length ? pretty(shown[shown.length - 1]) : 'No events yet.'}
          </pre>
        </div>

        <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Rendered OPEN_JSON_UI</div>
          <div style={{ background: '#fff' }}>{ui ? renderNode(ui) : <div style={{ opacity: 0.7 }}>Waiting for ACTIVITY_SNAPSHOT…</div>}</div>
        </div>
      </div>

      <div style={{ marginTop: 16, opacity: 0.75 }}>Open-JSON-UI renderer: (placeholder) — 我们下一步再接 ACTIVITY_SNAPSHOT/DELTA。</div>
    </div>
  )
}
