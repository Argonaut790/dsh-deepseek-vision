import { useEffect, useId, useMemo, useState } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { SeeImageCardProps, EvidenceViewProps, LoadEvidenceImage } from './slots.ts'
import { evidenceFromResult, foldEvidenceNodes, type SeeImageEvidence } from './evidence.ts'
import { classes } from './styles.ts'

interface ImageState {
  status: 'loading' | 'ready' | 'error'
  url?: string
}

function EvidenceThumbnail({
  attachment, index, loadImage, alt, loadingLabel, unavailableLabel,
}: {
  attachment: ImageAttachmentRef
  index: number
  loadImage: LoadEvidenceImage
  alt: string
  loadingLabel?: string
  unavailableLabel?: string
}) {
  const [state, setState] = useState<ImageState>({ status: 'loading' })
  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    void loadImage(attachment).then(
      url => { if (active) setState({ status: 'ready', url }) },
      () => { if (active) setState({ status: 'error' }) },
    )
    return () => { active = false }
  }, [attachment, loadImage])

  if (state.status === 'ready') {
    return (
      <img
        className={classes.evidenceThumbnail}
        src={state.url}
        alt={alt}
        loading="lazy"
        width={attachment.width}
        height={attachment.height}
      />
    )
  }
  return (
    <div
      className={classes.evidenceThumbnailStatus}
      role="img"
      aria-label={state.status === 'loading'
        ? loadingLabel ?? alt
        : unavailableLabel ?? alt}
      data-image-index={index}
      data-image-state={state.status}
    />
  )
}

function originLabel(origin: string, t: EvidenceViewProps['t']): string {
  if (origin === 'persistent' || origin === 'analyst') return t('evidence.origin.analyst')
  if (origin === 'one-shot' || origin === 'fallback') return t('evidence.origin.oneshot')
  return origin
}

/** Shared read-only evidence body used by the per-call card and workspace. */
export function EvidenceRecord({ evidence, loadImage, t, compact = false }: {
  evidence: SeeImageEvidence
  loadImage: LoadEvidenceImage
  t: EvidenceViewProps['t']
  compact?: boolean
}) {
  const headingId = useId()
  const questionSet = new Set(evidence.questions)
  const answers = [
    ...evidence.questions.map((question, index) => ({
      question,
      answer: evidence.answers.find(item => item.question === question)?.answer
        ?? evidence.answers[index]?.answer
        ?? t('evidence.answer.missing'),
    })),
    ...evidence.answers.filter(item => !questionSet.has(item.question)),
  ]
  return (
    <article
      className={compact ? classes.evidenceCallCard : classes.evidenceRecord}
      aria-labelledby={headingId}
      data-evidence-call-id={evidence.callId}
    >
      <header className={classes.evidenceHeader}>
        <div>
          <h3 id={headingId} className={classes.evidenceTitle}>{t('evidence.record.title')}</h3>
          <p className={classes.evidenceSummary}>{evidence.summary}</p>
        </div>
        <span className={classes.evidenceOrigin}>{originLabel(evidence.origin, t)}</span>
      </header>

      {evidence.images.length > 0 && (
        <div className={classes.evidenceThumbnails} aria-label={t('evidence.images')}>
          {evidence.images.map((image, index) => (
            <EvidenceThumbnail
              key={String(image.attachmentId)}
              attachment={image}
              index={index}
              loadImage={loadImage}
              alt={t('evidence.image.alt', {
                index: index + 1,
                name: image.name ?? t('evidence.image.unnamed'),
              })}
              loadingLabel={t('evidence.image.loading', {
                name: image.name ?? t('evidence.image.unnamed'),
              })}
              unavailableLabel={t('evidence.image.unavailable', {
                name: image.name ?? t('evidence.image.unnamed'),
              })}
            />
          ))}
        </div>
      )}

      <section className={classes.evidenceSection} aria-label={t('evidence.answers')}>
        <h4 className={classes.evidenceSectionTitle}>{t('evidence.answers')}</h4>
        <ol className={classes.evidenceAnswers}>
          {answers.map((item, index) => (
            <li key={`${index}:${item.question}`}>
              <span className={classes.evidenceQuestion}>{item.question}</span>
              <p className={classes.evidenceAnswer}>{item.answer}</p>
            </li>
          ))}
        </ol>
      </section>

      <details className={classes.evidenceOcr}>
        <summary>{t('evidence.ocr', { count: evidence.ocr.length })}</summary>
        <pre>{evidence.ocr.length === 0 ? t('evidence.ocr.empty') : evidence.ocr}</pre>
      </details>

      <section className={classes.evidenceSection} aria-label={t('evidence.uncertainties')}>
        <h4 className={classes.evidenceSectionTitle}>{t('evidence.uncertainties')}</h4>
        {evidence.uncertainties.length === 0
          ? <p className={classes.evidenceMuted}>{t('evidence.uncertainties.none')}</p>
          : (
              <ul className={classes.evidenceUncertainties}>
                {evidence.uncertainties.map((uncertainty, index) => (
                  <li key={`${index}:${uncertainty}`}>{uncertainty}</li>
                ))}
              </ul>
            )}
      </section>

      <footer className={classes.evidenceRoute}>
        <span>{t('evidence.route')}</span>
        <code>{evidence.route.provider} / {evidence.route.model}</code>
      </footer>
    </article>
  )
}

/** Atomic renderer for one `see_image` call in the conversation flow. */
export function SeeImageEvidenceCard({ block, loadImage, t }: SeeImageCardProps) {
  if (!('kind' in block)) {
    return (
      <article className={classes.evidenceCallCard} aria-busy="true" aria-label={t('evidence.call.running')}>
        <div className={classes.evidenceCallStatus}>{t('evidence.call.running')}</div>
      </article>
    )
  }
  if (block.isError) {
    return (
      <article className={classes.evidenceCallCard} role="alert" aria-label={t('evidence.call.failed')}>
        <div className={classes.evidenceCallStatus}>{t('evidence.call.failed')}</div>
      </article>
    )
  }
  const evidence = evidenceFromResult(block)
  if (evidence === undefined) {
    return (
      <article className={classes.evidenceCallCard} aria-label={t('evidence.call.unavailable')}>
        <div className={classes.evidenceCallStatus}>{t('evidence.call.unavailable')}</div>
      </article>
    )
  }
  return <EvidenceRecord evidence={evidence} loadImage={loadImage} t={t} compact />
}

/** Read-only conversation view over every loaded structured evidence result. */
export function EvidenceView({ useSession, loadImage, t }: EvidenceViewProps) {
  const nodes = useSession(snapshot => snapshot.nodes)
  const evidence = useMemo(() => foldEvidenceNodes(nodes), [nodes])
  return (
    <section
      className={classes.evidenceWorkspace}
      aria-label={t('evidence.view.aria')}
      data-conversation-composer-overlay=""
    >
      {evidence.length === 0
        ? (
            <div className={classes.evidenceEmpty} role="status">
              <strong>{t('evidence.empty.title')}</strong>
              <span>{t('evidence.empty.body')}</span>
            </div>
          )
        : (
            <div className={classes.evidenceList}>
              {evidence.map(record => (
                <EvidenceRecord
                  key={`${record.seq}:${record.callId}`}
                  evidence={record}
                  loadImage={loadImage}
                  t={t}
                />
              ))}
            </div>
          )}
    </section>
  )
}
