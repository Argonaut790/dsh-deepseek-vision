import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { createElement, type ReactNode } from 'react'
import { imageAttachmentNote, imageAttachmentNotes } from '../media.ts'
import { VISION_MEDIA_RAW_PREFIX, visionMediaRawPath } from '../shared.ts'

interface VisionUserProjection {
  readonly content: readonly ContentBlock[]
  readonly attachmentIds: ReadonlySet<string>
}

const OWN_IMAGE_MARKDOWN = new RegExp(
  String.raw`^!\[[^\]]*\]\((?:https?:\/\/[^/]+)?${VISION_MEDIA_RAW_PREFIX.replaceAll('/', String.raw`\/`)}[^)]+\)\s*$`,
)

function cleanText(text: string, refs: readonly ImageAttachmentRef[]): string {
  let visible = text
  for (const ref of refs) visible = visible.replaceAll(imageAttachmentNote(ref), '')
  return visible
    .split(/\r?\n/)
    .filter(line => !OWN_IMAGE_MARKDOWN.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Convert durable vision notes into native image blocks for Harness' stock gallery. */
export function projectVisionUserContent(content: readonly ContentBlock[]): VisionUserProjection {
  const refs: ImageAttachmentRef[] = []
  const projected: ContentBlock[] = []
  const displayed = new Set<string>()

  for (const block of content) {
    if (block.type === 'image') displayed.add(String(block.attachment.attachmentId))
    if (block.type !== 'text' || typeof block.text !== 'string') {
      projected.push(block)
      continue
    }
    const blockRefs = imageAttachmentNotes(block.text)
    refs.push(...blockRefs)
    const text = cleanText(block.text, blockRefs)
    if (text !== '') projected.push({ type: 'text', text })
  }

  const attachmentIds = new Set<string>()
  for (const ref of refs) {
    const id = String(ref.attachmentId)
    attachmentIds.add(id)
    if (displayed.has(id)) continue
    displayed.add(id)
    projected.push({ type: 'image', attachment: ref })
  }
  return { content: projected, attachmentIds }
}

/** Wrap the stock user-message renderer without copying Harness UI internals. */
export function visionUserMessageView(
  StockUserMessage: (props: ChatNodeViewProps<'user'>) => ReactNode,
): (props: ChatNodeViewProps<'user'>) => ReactNode {
  return function VisionUserMessage(props: ChatNodeViewProps<'user'>): ReactNode {
    const projection = projectVisionUserContent(props.node.data.content)
    if (projection.attachmentIds.size === 0) return createElement(StockUserMessage, props)

    const node = {
      ...props.node,
      data: { ...props.node.data, content: projection.content },
    }
    const loadImage: ChatNodeViewProps<'user'>['loadImage'] = attachment => {
      const id = String(attachment.attachmentId)
      return projection.attachmentIds.has(id)
        ? Promise.resolve(visionMediaRawPath(String(props.sessionId), id))
        : props.loadImage(attachment)
    }
    return createElement(StockUserMessage, { ...props, node, loadImage })
  }
}
