/**
 * DeepSeek vision Web plugin: global image-model picker plus conversation
 * evidence card and read-only Evidence workspace.
 *
 * @module dsh-deepseek-vision/client
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { EvidenceView, SeeImageEvidenceCard } from './EvidenceWorkspace.tsx'
import { VisionModelSelect } from './VisionModelSelect.tsx'
import type { EvidenceImageInjected, VisionModelSelectInjected } from './slots.ts'
import { en, zh, type VisionKey } from './locales.ts'
import { installStyles } from './styles.ts'
import { VisionModelDirectory } from './vision-directory.ts'
import { SEE_IMAGE_MODEL_SETTINGS_NAME } from '../shared.ts'

export {
  evidenceFromResult, evidenceMeta, foldEvidenceNodes,
} from './evidence.ts'
export type { SeeImageEvidence, SeeImageEvidenceMeta } from './evidence.ts'
export { EvidenceRecord, EvidenceView, SeeImageEvidenceCard } from './EvidenceWorkspace.tsx'
export { VisionModelDirectory, imageModelGroups } from './vision-directory.ts'
export type { VisionModelDirectoryState } from './vision-directory.ts'
export type {
  EvidenceImageInjected, EvidenceViewProps, LoadEvidenceImage, SeeImageCardProps,
  VisionModelSelectInjected,
} from './slots.ts'
export type { VisionKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for the global picker and conversation Evidence surfaces. */
    deepseekVision: VisionKey
  }
}

interface ConversationImageFace {
  resolveImage: (sessionId: SessionId, attachment: ImageAttachmentRef) => Promise<string>
}

export const inject = ['locale', 'connection', 'conversation', 'slots', 'remote']

/** Register the picker, structured Tool card, and read-only Evidence view. */
export function apply(ctx: ClientContext): void {
  ctx.effect(installStyles, 'dsh-deepseek-vision: styles')
  ctx.effect(
    () => ctx.locale.register('deepseekVision', { zh, en }),
    'dsh-deepseek-vision: dictionaries',
  )
  const t = ctx.locale.bind('deepseekVision')

  const connection = ctx.get('connection') as ConnectionHandle
  const visionDirectory = new VisionModelDirectory(connection.api)
  const injected: VisionModelSelectInjected = {
    directory: visionDirectory.store,
    load: () => { void visionDirectory.load().catch(() => undefined) },
    select: selection => visionDirectory.select(selection).then(() => true, () => false),
  }

  ctx.effect(() => {
    const settingsMoved = ctx.remote.$on('settings/document-updated', (namespace) => {
      if (namespace === SEE_IMAGE_MODEL_SETTINGS_NAME) injected.load()
    })
    const adaptersMoved = ctx.remote.$on('llm/adapters-updated', injected.load)
    const connectionReset = ctx.on('connection/reset', () => { visionDirectory.resetConnected() })
    injected.load()
    return () => {
      settingsMoved()
      adaptersMoved()
      connectionReset()
      visionDirectory.dispose()
    }
  }, 'dsh-deepseek-vision: global directory')

  ctx.inject(['slots'], (scope: ClientContext) => {
    const conversation = scope.get('conversation') as unknown as ConversationImageFace
    const evidenceInject = (sessionId: SessionId): EvidenceImageInjected => ({
      loadImage: attachment => conversation.resolveImage(sessionId, attachment),
    })
    scope.slots.inject('tool.call.toolview', () => scope.slots.register({
      name: 'tool.call.toolview',
      key: 'see_image',
      locale: 'deepseekVision',
      inject: evidenceInject,
    }, SeeImageEvidenceCard))
    scope.slots.inject('conversation.view', () => scope.slots.register({
      name: 'conversation.view',
      id: 'evidence',
      order: 20,
      label: () => t('evidence.view.label'),
      locale: 'deepseekVision',
      inject: evidenceInject,
    }, EvidenceView))
    scope.slots.inject('conversation.input.right', () => scope.slots.register({
      name: 'conversation.input.right',
      id: 'deepseek-vision-model',
      order: 100,
      locale: 'deepseekVision',
      inject: (): VisionModelSelectInjected => injected,
    }, VisionModelSelect))
  })
}
