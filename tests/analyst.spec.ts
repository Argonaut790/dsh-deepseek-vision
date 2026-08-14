import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SubagentRunEndInfo } from '@deepseek-ai/dsh-subagent'
import {
  VISION_PERSONA,
  analyzeVision,
  visionAnalystLabel,
} from '../src/analyst.ts'

const ROUTE = { provider: 'openrouter', model: 'vision-a', maxTokens: 8192 }
const READBACK = {
  summary: 'A screen.',
  ocr: 'Hello',
  answers: [{ question: 'What?', answer: 'A screen.' }],
  uncertainties: [],
}

function sessionId(value: string): SessionId {
  return value as SessionId
}

function image(attachmentId: string): ImageAttachmentRef {
  return {
    attachmentId: attachmentId as ImageAttachmentRef['attachmentId'],
    mediaType: 'image/png',
    bytes: 100,
    width: 10,
    height: 10,
  }
}

function parent(): Agent {
  return {
    id: sessionId('parent'),
    session: { events: [] },
  } as unknown as Agent
}

interface FakeOptions {
  persistence: boolean
  abortOnFollowup?: AbortController
  children?: Array<{
    kind: 'child'
    id: SessionId
    activity: 'inactive'
    hasChildren: false
    mode: 'continuable'
    label: string
  }>
  seen?: ImageAttachmentRef[]
}

function fakeContext(options: FakeOptions) {
  const listeners = new Set<(info: SubagentRunEndInfo) => void>()
  const emitEnd = (id: SessionId, stopReason = 'completed' as const): void => {
    const info = {
      runId: 'run' as SubagentRunEndInfo['runId'],
      provider: 'spawn',
      id,
      local: true,
      stopReason,
      lastAssistantMessage: [{ type: 'text' as const, text: JSON.stringify(READBACK) }],
    }
    for (const listener of listeners) listener(info)
  }
  const start = vi.fn(async () => ({
    id: sessionId('one-shot'),
    localAgent: undefined,
    result: Promise.resolve({
      output: [],
      structured: READBACK,
      stopReason: 'completed' as const,
    }),
    dispose: vi.fn(async () => {}),
  }))
  const startContinuable = vi.fn(async () => {
    const childId = sessionId('new-analyst')
    queueMicrotask(() => emitEnd(childId))
    return { childId, messageId: 'message' }
  })
  const followup = vi.fn(async (_parent, childId: SessionId) => {
    queueMicrotask(() => {
      if (options.abortOnFollowup !== undefined) {
        options.abortOnFollowup.abort(new Error('cancelled'))
        emitEnd(childId, 'aborted')
      } else {
        emitEnd(childId)
      }
    })
    return 'message'
  })
  const interrupt = vi.fn()
  const ctx = {
    get(name: string) {
      if (name !== 'sessionPersistence' || !options.persistence) return undefined
      return {
        inspect: vi.fn(async () => ({
          events: (options.seen ?? []).map(attachment => ({
            data: { content: [{ type: 'image', attachment }] },
          })),
        })),
      }
    },
    on(name: string, listener: (info: SubagentRunEndInfo) => void) {
      if (name === 'subagent/end') listeners.add(listener)
      return () => listeners.delete(listener)
    },
    subagents: {
      start,
      startContinuable,
      followup,
      interrupt,
      listChildren: vi.fn(async () => options.children ?? []),
      getProvider: vi.fn(() => ({
        name: 'spawn',
        capabilities: {
          outputSchema: true,
          depthLimit: true,
          toolFilter: true,
          persona: true,
        },
        inheritsParentContext: false,
        start: vi.fn(),
        prepareContinuable: vi.fn(async () => ({})),
      })),
    },
  }
  return {
    ctx: ctx as unknown as Context,
    start,
    startContinuable,
    followup,
    interrupt,
  }
}

describe('vision analyst orchestration', () => {
  it('uses and disposes the outputSchema one-shot path without persistence', async () => {
    const fake = fakeContext({ persistence: false })
    const result = await analyzeVision(fake.ctx, {
      subagentProvider: 'spawn',
      parent: parent(),
      route: ROUTE,
      images: [image('one')],
      questions: ['What?'],
      signal: new AbortController().signal,
    })

    expect(result).toEqual({ origin: 'one-shot', readback: READBACK })
    expect(fake.start).toHaveBeenCalledOnce()
    expect(fake.start.mock.calls[0]?.[1]).toMatchObject({
      persona: VISION_PERSONA,
      toolFilter: { allow: [] },
      outputSchema: expect.any(Object),
    })
  })

  it('reuses the newest matching route and sends only unseen images', async () => {
    const childId = sessionId('existing-analyst')
    const fake = fakeContext({
      persistence: true,
      children: [{
        kind: 'child',
        id: childId,
        activity: 'inactive',
        hasChildren: false,
        mode: 'continuable',
        label: visionAnalystLabel(ROUTE),
      }],
      seen: [image('one')],
    })
    const result = await analyzeVision(fake.ctx, {
      subagentProvider: 'spawn',
      parent: parent(),
      route: ROUTE,
      images: [image('one'), image('two')],
      questions: ['What?'],
      signal: new AbortController().signal,
    })

    expect(result).toEqual({ origin: 'persistent', analystId: childId, readback: READBACK })
    expect(fake.startContinuable).not.toHaveBeenCalled()
    expect(fake.followup).toHaveBeenCalledOnce()
    const prompt = fake.followup.mock.calls[0]?.[2] as Array<{
      type: string
      attachment?: ImageAttachmentRef
    }>
    expect(prompt.filter(block => block.type === 'image').map(block => block.attachment?.attachmentId))
      .toEqual(['two'])
  })

  it('starts a new analyst when the newest analyst route changed', async () => {
    const oldRoute = { ...ROUTE, model: 'vision-old' }
    const fake = fakeContext({
      persistence: true,
      children: [{
        kind: 'child',
        id: sessionId('old-analyst'),
        activity: 'inactive',
        hasChildren: false,
        mode: 'continuable',
        label: visionAnalystLabel(oldRoute),
      }],
    })
    const result = await analyzeVision(fake.ctx, {
      subagentProvider: 'spawn',
      parent: parent(),
      route: ROUTE,
      images: [image('one')],
      questions: ['What?'],
      signal: new AbortController().signal,
    })

    expect(result.analystId).toBe(sessionId('new-analyst'))
    expect(fake.startContinuable).toHaveBeenCalledOnce()
    expect(fake.followup).not.toHaveBeenCalled()
  })

  it('interrupts cancellation without disposing the persistent child', async () => {
    const controller = new AbortController()
    const childId = sessionId('existing-analyst')
    const fake = fakeContext({
      persistence: true,
      abortOnFollowup: controller,
      children: [{
        kind: 'child',
        id: childId,
        activity: 'inactive',
        hasChildren: false,
        mode: 'continuable',
        label: visionAnalystLabel(ROUTE),
      }],
      seen: [image('one')],
    })

    await expect(analyzeVision(fake.ctx, {
      subagentProvider: 'spawn',
      parent: parent(),
      route: ROUTE,
      images: [image('one')],
      questions: ['What?'],
      signal: controller.signal,
    })).rejects.toThrow('cancelled')
    expect(fake.interrupt).toHaveBeenCalledWith(childId, {
      kind: 'ancestor',
      agent: expect.objectContaining({ id: sessionId('parent') }),
    })
    expect(fake.start).not.toHaveBeenCalled()
  })
})
