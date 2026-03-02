import express from 'express'
import cors from 'cors'
import { EventType } from '@ag-ui/core'
import type {
  ActivitySnapshotEvent,
  ActivityDeltaEvent,
  BaseEvent,
  RunErrorEvent,
  RunFinishedEvent,
  RunStartedEvent,
  StateSnapshotEvent,
  StateDeltaEvent,
  StepFinishedEvent,
  StepStartedEvent,
  TextMessageContentEvent,
  TextMessageEndEvent,
  TextMessageStartEvent,
  ToolCallArgsEvent,
  ToolCallChunkEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,
  ToolCallStartEvent,
  CustomEvent,
} from '@ag-ui/core'

type UiChangeValue = { kind: 'select'; id: string } | { kind: 'select_first' } | { kind: 'refetch' }

const items = [
  { id: 'doc1', title: 'AG-UI Events Concept', score: 0.92 },
  { id: 'doc2', title: 'AG-UI JS Core Events', score: 0.87 },
]

const app = express()
app.use(cors())
app.use(express.json())

type SSEClient = { id: string; res: express.Response }
const clients = new Map<string, SSEClient>()

type Emit = (event: BaseEvent) => void

function sseHeaders(res: express.Response) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  ;(res as any).flushHeaders?.()
}

function writeEvent(res: { write: (chunk: string) => any }, event: BaseEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

function broadcast(event: BaseEvent) {
  const et = (event as any)?.type ?? '(no-type)'
  console.log('[broadcast] clients =', clients.size, 'event =', et)

  for (const [id, c] of clients) {
    try {
      writeEvent(c.res, event)
    } catch (e) {
      console.log('[broadcast] drop client', id, e)
      clients.delete(id)
      try {
        c.res.end()
      } catch {
        /* empty */
      }
    }
  }
}

// --- SSE 长连接：只负责订阅事件 ---
app.get('/agui/stream', (req, res) => {
  sseHeaders(res)

  const id = `c_${Date.now()}_${Math.random().toString(16).slice(2)}`
  clients.set(id, { id, res })
  console.log('[sse] connected', id, 'clients =', clients.size)

  // 立刻写点东西，避免缓冲
  res.write(`: connected ${id}\n\n`)

  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`)
    } catch {
      clearInterval(heartbeat)
    }
  }, 15000)

  req.on('close', () => {
    clearInterval(heartbeat)
    clients.delete(id)
    console.log('[sse] closed', id, 'clients =', clients.size)
  })
})

app.post('/debug/broadcast', (_req, res) => {
  broadcast({
    type: EventType.CUSTOM,
    name: 'debug.ping',
    value: { t: Date.now() },
    timestamp: Date.now(),
  } as any)
  res.json({ ok: true })
})

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function splitIntoRandomChunks(text: string, min = 2, max = 6) {
  const result: string[] = []
  let i = 0
  while (i < text.length) {
    const size = Math.floor(Math.random() * (max - min + 1)) + min
    result.push(text.slice(i, i + size))
    i += size
  }
  return result
}

function mkEvent<T extends object>(obj: T): T & { timestamp: number } {
  return { ...obj, timestamp: Date.now() }
}

type RunMode = 'success' | 'error'
const UI_MESSAGE_ID = 'activity:open_json_ui'

async function streamLifecycle(emit: Emit, mode: RunMode, stream: boolean) {
  const threadId = 'thread_demo'
  const runId = `run_${Date.now()}`

  emit(
    mkEvent({
      type: EventType.RUN_STARTED,
      threadId,
      runId,
    }) as RunStartedEvent,
  )

  // ---------- STEP 1: plan (TextMessage streaming) ----------
  {
    const stepName = 'plan'
    const stepId = `${runId}:${stepName}`

    emit(
      mkEvent({
        type: EventType.STEP_STARTED,
        threadId,
        runId,
        stepId,
        stepName,
      }) as StepStartedEvent,
    )

    await sleep(120)

    const messageId = `${runId}:msg:plan`

    emit(
      mkEvent({
        type: EventType.TEXT_MESSAGE_START,
        threadId,
        runId,
        messageId,
        role: 'assistant',
      }) as TextMessageStartEvent,
    )

    const chunks = ['我先做计划：', '1) 明确目标；', '2) 执行阶段调用工具获取数据；', '3) 渲染阶段产出 UI。']

    if (!stream) {
      await sleep(600)
      emit(
        mkEvent({
          type: EventType.TEXT_MESSAGE_CONTENT,
          threadId,
          runId,
          messageId,
          delta: chunks.join(''),
        }) as TextMessageContentEvent,
      )
    } else {
      for (const c of chunks) {
        const pieces = splitIntoRandomChunks(c)
        for (const piece of pieces) {
          await sleep(40)
          emit(
            mkEvent({
              type: EventType.TEXT_MESSAGE_CHUNK,
              threadId,
              runId,
              messageId,
              delta: piece,
            }) as any,
          )
        }
        await sleep(80)
      }
    }

    await sleep(100)

    emit(
      mkEvent({
        type: EventType.TEXT_MESSAGE_END,
        threadId,
        runId,
        messageId,
      }) as TextMessageEndEvent,
    )

    await sleep(120)

    emit(
      mkEvent({
        type: EventType.STEP_FINISHED,
        threadId,
        runId,
        stepId,
        stepName,
        status: 'ok',
      }) as StepFinishedEvent,
    )

    await sleep(120)
  }

  // ---------- STEP 2: execute (ToolCall lifecycle) ----------
  {
    const stepName = 'execute'
    const stepId = `${runId}:${stepName}`

    emit(
      mkEvent({
        type: EventType.STEP_STARTED,
        threadId,
        runId,
        stepId,
        stepName,
      }) as StepStartedEvent,
    )

    await sleep(120)

    const toolCallId = `${runId}:tool:1`

    emit(
      mkEvent({
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: 'searchDocs',
      }) as ToolCallStartEvent,
    )

    const argsChunks = ['{"query":"ag-ui lifecycle', ' + text message', ' + tool call"}']
    if (!stream) {
      await sleep(140)
      emit(
        mkEvent({
          type: EventType.TOOL_CALL_ARGS,
          toolCallId,
          toolCallName: 'searchDocs',
          delta: argsChunks.join(''),
        }) as ToolCallArgsEvent,
      )
    } else {
      const fullArgs = `{"query":"ag-ui lifecycle + text message + tool call"}`
      const pieces = splitIntoRandomChunks(fullArgs)
      for (const piece of pieces) {
        await sleep(15)
        emit(
          mkEvent({
            type: EventType.TOOL_CALL_CHUNK,
            toolCallId,
            toolCallName: 'searchDocs',
            delta: piece,
          }) as ToolCallChunkEvent,
        )
      }
    }

    await sleep(80)
    emit(
      mkEvent({
        type: EventType.TOOL_CALL_END,
        toolCallId,
        toolCallName: 'searchDocs',
      }) as ToolCallEndEvent,
    )

    if (mode === 'error') {
      await sleep(150)

      emit(
        mkEvent({
          type: EventType.TOOL_CALL_RESULT,
          toolCallId,
          messageId: `${runId}:toolcallresult:${toolCallId}`,
          content: JSON.stringify({ ok: false, error: { message: 'Search backend unavailable' } }),
          role: 'tool',
        }) as ToolCallResultEvent,
      )

      await sleep(80)

      emit(
        mkEvent({
          type: EventType.STEP_FINISHED,
          stepName,
          status: 'failed',
        }) as StepFinishedEvent,
      )

      await sleep(80)

      emit(
        mkEvent({
          type: EventType.RUN_ERROR,
          message: 'Execute step failed',
          code: 'DEMO_EXECUTE_ERROR',
        }) as RunErrorEvent,
      )

      return
    }

    await sleep(180)
    emit(
      mkEvent({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId,
        messageId: `${runId}:toolcallresult:${toolCallId}`,
        content: JSON.stringify({
          ok: true,
          items: [
            { title: 'AG-UI Events Concept', score: 0.92 },
            { title: 'AG-UI JS Core Events', score: 0.87 },
          ],
        }),
        role: 'tool',
      }) as ToolCallResultEvent,
    )

    const stateSnapshot: StateSnapshotEvent = {
      type: EventType.STATE_SNAPSHOT,
      snapshot: {
        phase: 'execute_done',
        items,
        selectedId: null,
      },
    }
    emit(mkEvent(stateSnapshot))

    await sleep(100)
    emit(
      mkEvent({
        type: EventType.STEP_FINISHED,
        stepName,
        status: 'ok',
      }) as StepFinishedEvent,
    )

    await sleep(120)
  }

  // ---------- STEP 3: render (Activity/Open-JSON-UI) ----------
  {
    const stepName = 'render'

    emit(
      mkEvent({
        type: EventType.STEP_STARTED,
        stepName,
      }) as StepStartedEvent,
    )

    const loadingSnapshot: ActivitySnapshotEvent = {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: UI_MESSAGE_ID,
      activityType: 'OPEN_JSON_UI',
      replace: true,
      content: {
        type: 'page',
        children: [
          {
            type: 'card',
            title: 'OPEN_JSON_UI Demo',
            children: [{ type: 'text', value: 'Loading results from execute step...' }],
          },
        ],
      },
    }
    emit(mkEvent(loadingSnapshot))

    await sleep(1000)

    const delta: ActivityDeltaEvent = {
      type: EventType.ACTIVITY_DELTA,
      messageId: UI_MESSAGE_ID,
      activityType: 'OPEN_JSON_UI',
      patch: [
        { op: 'replace', path: '/children/0/children/0/value', value: 'Results loaded ✅' },
        { op: 'add', path: '/children/0/children/1', value: { type: 'text', value: '• AG-UI Events Concept (0.92)' } },
        { op: 'add', path: '/children/0/children/2', value: { type: 'text', value: '• AG-UI JS Core Events (0.87)' } },
        {
          op: 'add',
          path: '/children/0/children/3',
          value: {
            type: 'button',
            label: 'Select first item',
            action: {
              type: 'custom_event',
              name: 'ui.change',
              value: { kind: 'select_first' },
            },
          },
        },
      ],
    }
    emit(mkEvent(delta))

    await sleep(100)

    // const stateDelta: StateDeltaEvent = {
    //   type: EventType.STATE_DELTA,
    //   delta: [
    //     { op: 'replace', path: '/selectedId', value: 'doc1' },
    //     { op: 'replace', path: '/phase', value: 'selected_first' },
    //   ],
    // }
    // emit(mkEvent(stateDelta))

    emit(
      mkEvent({
        type: EventType.STEP_FINISHED,
        stepName,
        status: 'ok',
      }) as StepFinishedEvent,
    )
  }

  await sleep(100)

  emit(
    mkEvent({
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      result: { ok: true },
    }) as RunFinishedEvent,
  )
}

// ✅ 触发 run：直接广播全部事件
app.post('/run', async (req, res) => {
  const mode = (req.query.mode === 'error' ? 'error' : 'success') as RunMode
  const stream = req.query.stream === 'true'

  if (clients.size === 0) {
    return res.status(409).json({ ok: false, error: 'No SSE clients connected. Open /agui/stream first.' })
  }

  try {
    await streamLifecycle(broadcast, mode, stream)
    res.json({ ok: true })
  } catch (e: any) {
    console.error('[run] error', e)
    res.status(500).json({ ok: false, error: e?.message ?? String(e) })
  }
})

// ✅ UI → Server：CUSTOM(ui.change)
app.post('/event', (req, res) => {
  const ev = req.body as CustomEvent

  // 可选：把 client 发来的 CUSTOM 也回显到 timeline
  if (ev?.type === EventType.CUSTOM) {
    broadcast({ ...ev, timestamp: (ev as any).timestamp ?? Date.now() } as any)
  }

  if (ev?.type === EventType.CUSTOM && ev.name === 'ui.change') {
    const v = ev.value as UiChangeValue | undefined

    if (v?.kind === 'select_first') {
      const delta: StateDeltaEvent = {
        type: EventType.STATE_DELTA,
        timestamp: Date.now(),
        delta: [
          { op: 'replace', path: '/selectedId', value: 'doc1' },
          { op: 'replace', path: '/phase', value: 'selected_first_by_ui_change' },
        ],
      }
      broadcast(delta)

      const uiDelta: ActivityDeltaEvent = {
        type: EventType.ACTIVITY_DELTA,
        messageId: UI_MESSAGE_ID,
        activityType: 'OPEN_JSON_UI',
        patch: [{ op: 'add', path: '/children/0/children/-', value: { type: 'text', value: 'Selected: doc1' } }],
        timestamp: Date.now(),
      }
      broadcast(uiDelta)
    }

    if (v?.kind === 'select') {
      const delta: StateDeltaEvent = {
        type: EventType.STATE_DELTA,
        timestamp: Date.now(),
        delta: [
          { op: 'replace', path: '/selectedId', value: v.id },
          { op: 'replace', path: '/phase', value: 'selected_by_ui_change' },
        ],
      }
      broadcast(delta)
    }
  }

  res.json({ ok: true })
})

app.listen(3001, () => {
  console.log('AG-UI stream : http://localhost:3001/agui/stream')
  console.log('Run (POST)  : http://localhost:3001/run?mode=success&stream=true')
})