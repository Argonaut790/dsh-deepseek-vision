/**
 * Compact process-wide vision-model picker rendered beside the conversation
 * model chooser.
 */

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconCheckOutline16, IconChevronDownOutline14, IconWarningOutline16, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { VisionModelSelectInjected } from './slots.ts'
import { classes } from './styles.ts'

function classNames(...values: Array<string | false>): string {
  return values.filter(Boolean).join(' ')
}

/**
 * Render the global image-capable provider/model picker.
 * @param props - filtered directory, persistence verb, and localized copy.
 */
export function VisionModelSelect(
  { directory, load, select, t }: VisionModelSelectInjected & PropsLocale<'deepseekVision'>,
) {
  const state = useSyncExternalStore(
    listener => directory.subscribe(listener),
    () => directory.getSnapshot(),
  )
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const id = useId()

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  if (state.available === false) return null

  const currentGroup = state.current === null
    ? undefined
    : state.groups.find(group => group.id === state.current?.provider)
  const currentChoice = currentGroup?.models.find(model => model.id === state.current?.model)
  const modelLabel = currentChoice?.name ?? state.current?.model
  const triggerLabel = modelLabel === undefined
    ? t('trigger.fallback')
    : t('trigger.current', { model: modelLabel })
  const triggerAria = t('trigger.aria', {
    model: modelLabel ?? t('trigger.fallback'),
  })
  const busy = state.status === 'selecting'

  const reload = (): void => { load() }
  const choose = (selection: ModelSelection): void => {
    if (state.current?.provider === selection.provider && state.current.model === selection.model) {
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    void select(selection).then((accepted) => {
      if (accepted) {
        setOpen(false)
        queueMicrotask(() => { triggerRef.current?.focus() })
        return
      }
      const message = directory.getSnapshot().error
      if (message === null) return
      toastSeq.current += 1
      setToast({ seq: toastSeq.current, text: t('error.action', { message }) })
    })
  }

  return (
    <div
      ref={rootRef}
      className={classes.root}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        event.preventDefault()
        setOpen(false)
        queueMicrotask(() => { triggerRef.current?.focus() })
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={classes.trigger}
        aria-label={triggerAria}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-vision-menu` : undefined}
        title={triggerLabel}
        disabled={!state.writable || busy}
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) reload()
        }}
      >
        <span className={classes.triggerLabel}>{triggerLabel}</span>
        <IconChevronDownOutline14
          className={classNames(classes.chevron, open && classes.chevronOpen)}
        />
      </button>

      {open && (
        <div
          id={`${id}-vision-menu`}
          className={classes.menu}
          role="menu"
          aria-label={t('menu.aria')}
          aria-busy={state.status === 'loading' || busy}
        >
          {state.status === 'loading' && (
            <div className={classes.status}>{t('status.loading')}</div>
          )}
          {state.error !== null && (
            <div className={classes.error}>
              <span>{t('error.action', { message: state.error })}</span>
              <button type="button" className={classes.retry} onClick={reload}>
                {t('action.reload')}
              </button>
            </div>
          )}
          {state.failures.map(failure => (
            <div className={classes.warning} key={failure.id}>
              <span>{t('warning.groupLoad', { name: failure.name, message: failure.message })}</span>
              <button type="button" className={classes.retry} onClick={reload}>
                {t('action.reload')}
              </button>
            </div>
          ))}
          <div className={classNames(classes.groups, 'scrollable')}>
            {state.groups.map((group) => {
              const headingId = `${id}-vision-${group.id}`
              return (
                <section role="group" aria-labelledby={headingId} className={classes.group} key={group.id}>
                  <div className={classes.groupTitle} id={headingId}>{group.name}</div>
                  {group.models.map((model) => {
                    const selected = state.current?.provider === group.id && state.current.model === model.id
                    return (
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        className={classNames(classes.option, selected && classes.selected)}
                        key={model.id}
                        title={model.name}
                        disabled={busy}
                        onClick={() => { choose({ provider: group.id, model: model.id }) }}
                      >
                        <span className={classes.optionCopy}>
                          <span className={classes.modelName}>{model.name}</span>
                          {model.description !== undefined && (
                            <span className={classes.description}>{model.description}</span>
                          )}
                        </span>
                        <span className={classes.check}>
                          {selected ? <IconCheckOutline16 /> : null}
                        </span>
                      </button>
                    )
                  })}
                </section>
              )
            })}
          </div>
          {state.status === 'ready' && state.groups.length === 0 && (
            <div className={classes.empty}>{t('empty.models')}</div>
          )}
        </div>
      )}
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          icon={<IconWarningOutline16 />}
          anchor={rootRef.current?.closest<HTMLElement>('[data-composer-card]') ?? null}
          onDone={() => { setToast(null) }}
        />
      )}
    </div>
  )
}
