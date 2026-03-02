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
} from '@ag-ui/core'

type JSONPatchOp = { op: 'add'; path: string; value: any } | { op: 'replace'; path: string; value: any } | { op: 'remove'; path: string }

const app = express()
app.use(cors())

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

function sseHeaders(res: express.Response) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  // 某些环境下能更快 flush
  ;(res as any).flushHeaders?.()
}

function sseWrite(res: express.Response, event: BaseEvent) {
  // 标准 SSE：每条消息一段 data: JSON + 空行
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

// 生成一个最小 lifecycle 事件对象：携带 threadId/runId/timestamp 这些“共通”字段
function mkEvent<T extends object>(obj: T): T & { timestamp: number } {
  return { ...obj, timestamp: Date.now() }
}

type RunMode = 'success' | 'error'

async function streamLifecycle(res: express.Response, mode: RunMode, stream: boolean) {
  const threadId = 'thread_demo'
  const runId = `run_${Date.now()}`

  sseWrite(
    res,
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

    sseWrite(
      res,
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

    sseWrite(
      res,
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
      sseWrite(
        res,
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
          sseWrite(
            res,
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

    sseWrite(
      res,
      mkEvent({
        type: EventType.TEXT_MESSAGE_END,
        threadId,
        runId,
        messageId,
      }) as TextMessageEndEvent,
    )

    await sleep(120)

    sseWrite(
      res,
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

  // 如果你希望 error 模式在 execute 阶段失败，这里不 return
  // ---------- STEP 2: execute (ToolCall lifecycle) ----------
  {
    const stepName = 'execute'
    const stepId = `${runId}:${stepName}`

    sseWrite(
      res,
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

    sseWrite(
      res,
      mkEvent({
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: 'searchDocs',
      }) as ToolCallStartEvent,
    )

    const argsChunks = ['{"query":"ag-ui lifecycle', ' + text message', ' + tool call"}']
    if (!stream) {
      await sleep(140)
      sseWrite(
        res,
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
        sseWrite(
          res,
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
    sseWrite(
      res,
      mkEvent({
        type: EventType.TOOL_CALL_END,
        toolCallId,
        toolCallName: 'searchDocs',
      }) as ToolCallEndEvent,
    )

    // error 模式：在工具结果处失败 + RUN_ERROR
    if (mode === 'error') {
      await sleep(150)

      sseWrite(
        res,
        mkEvent({
          type: EventType.TOOL_CALL_RESULT,
          toolCallId,
          messageId: `${runId}:toolcallresult:${toolCallId}`,
          content: JSON.stringify({ ok: false, error: { message: 'Search backend unavailable' } }),
          role: 'tool',
        }) as ToolCallResultEvent,
      )

      await sleep(80)

      sseWrite(
        res,
        mkEvent({
          type: EventType.STEP_FINISHED,
          stepName,
          status: 'failed',
        }) as StepFinishedEvent,
      )

      await sleep(80)

      sseWrite(
        res,
        mkEvent({
          type: EventType.RUN_ERROR,
          message: 'Execute step failed',
          code: 'DEMO_EXECUTE_ERROR',
        }) as RunErrorEvent,
      )

      return
    }

    // success 模式：返回结构化结果
    await sleep(180)
    sseWrite(
      res,
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

    await sleep(100)
    sseWrite(
      res,
      mkEvent({
        type: EventType.STEP_FINISHED,
        stepName,
        status: 'ok',
      }) as StepFinishedEvent,
    )

    await sleep(120)
  }

  // ---------- STEP 3: render (placeholder for Activity/Open-JSON-UI) ----------
  {
    const stepName = 'render'

    sseWrite(
      res,
      mkEvent({
        type: EventType.STEP_STARTED,
        stepName,
      }) as StepStartedEvent,
    )

    const uiMessageId = `${runId}:activity:open_json_ui`

    const loadingSnapshot: ActivitySnapshotEvent = {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: uiMessageId,
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
      timestamp: Date.now(),
    }

    sseWrite(res, loadingSnapshot)

    await sleep(1000)

    const delta: ActivityDeltaEvent = {
      type: EventType.ACTIVITY_DELTA,
      messageId: uiMessageId,
      activityType: 'OPEN_JSON_UI',
      patch: [
        {
          op: 'replace',
          path: '/children/0/children/0/value',
          value: 'Results loaded ✅',
        },
        {
          op: 'add',
          path: '/children/0/children/1',
          value: { type: 'text', value: '• AG-UI Events Concept (0.92)' },
        },
        {
          op: 'add',
          path: '/children/0/children/2',
          value: { type: 'text', value: '• AG-UI JS Core Events (0.87)' },
        },
        {
          op: 'add',
          path: '/children/0/children/3',
          value: {
            type: 'button',
            label: 'Say hi',
            action: { type: 'alert', message: 'Hello from ACTIVITY_DELTA' },
          },
        },
      ],
      timestamp: Date.now(),
    }

    sseWrite(res, delta)
    await sleep(100)

    sseWrite(
      res,
      mkEvent({
        type: EventType.STEP_FINISHED,
        stepName,
        status: 'ok',
      }) as StepFinishedEvent,
    )
  }

  await sleep(100)

  sseWrite(
    res,
    mkEvent({
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      result: { ok: true },
    }) as RunFinishedEvent,
  )
}

app.get('/agui/lifecycle', async (req, res) => {
  sseHeaders(res)

  const mode = (req.query.mode === 'error' ? 'error' : 'success') as RunMode
  const stream = req.query.stream === 'true'

  try {
    await streamLifecycle(res, mode, stream)
  } finally {
    res.end()
  }
})

app.listen(3001, () => {
  console.log('AG-UI lifecycle SSE on http://localhost:3001/agui/lifecycle')
  console.log('  success: http://localhost:3001/agui/lifecycle?mode=success')
  console.log('  error:   http://localhost:3001/agui/lifecycle?mode=error')
})
