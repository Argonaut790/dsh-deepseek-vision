export const classes = {
  root: 'dsh-deepseek-vision-root',
  trigger: 'dsh-deepseek-vision-trigger',
  triggerLabel: 'dsh-deepseek-vision-trigger-label',
  chevron: 'dsh-deepseek-vision-chevron',
  chevronOpen: 'dsh-deepseek-vision-chevron-open',
  menu: 'dsh-deepseek-vision-menu',
  status: 'dsh-deepseek-vision-status',
  empty: 'dsh-deepseek-vision-empty',
  error: 'dsh-deepseek-vision-error',
  warning: 'dsh-deepseek-vision-warning',
  retry: 'dsh-deepseek-vision-retry',
  groups: 'dsh-deepseek-vision-groups',
  group: 'dsh-deepseek-vision-group',
  groupTitle: 'dsh-deepseek-vision-group-title',
  option: 'dsh-deepseek-vision-option',
  selected: 'dsh-deepseek-vision-selected',
  optionCopy: 'dsh-deepseek-vision-option-copy',
  modelName: 'dsh-deepseek-vision-model-name',
  description: 'dsh-deepseek-vision-description',
  check: 'dsh-deepseek-vision-check',
  evidenceWorkspace: 'dsh-deepseek-vision-evidence-workspace',
  evidenceList: 'dsh-deepseek-vision-evidence-list',
  evidenceEmpty: 'dsh-deepseek-vision-evidence-empty',
  evidenceRecord: 'dsh-deepseek-vision-evidence-record',
  evidenceCallCard: 'dsh-deepseek-vision-evidence-call-card',
  evidenceHeader: 'dsh-deepseek-vision-evidence-header',
  evidenceTitle: 'dsh-deepseek-vision-evidence-title',
  evidenceSummary: 'dsh-deepseek-vision-evidence-summary',
  evidenceOrigin: 'dsh-deepseek-vision-evidence-origin',
  evidenceThumbnails: 'dsh-deepseek-vision-evidence-thumbnails',
  evidenceThumbnail: 'dsh-deepseek-vision-evidence-thumbnail',
  evidenceThumbnailStatus: 'dsh-deepseek-vision-evidence-thumbnail-status',
  evidenceSection: 'dsh-deepseek-vision-evidence-section',
  evidenceSectionTitle: 'dsh-deepseek-vision-evidence-section-title',
  evidenceAnswers: 'dsh-deepseek-vision-evidence-answers',
  evidenceQuestion: 'dsh-deepseek-vision-evidence-question',
  evidenceAnswer: 'dsh-deepseek-vision-evidence-answer',
  evidenceOcr: 'dsh-deepseek-vision-evidence-ocr',
  evidenceUncertainties: 'dsh-deepseek-vision-evidence-uncertainties',
  evidenceMuted: 'dsh-deepseek-vision-evidence-muted',
  evidenceRoute: 'dsh-deepseek-vision-evidence-route',
  evidenceCallStatus: 'dsh-deepseek-vision-evidence-call-status',
} as const

/** Self-contained plugin styles, injected and removed with the client lifecycle. */
export const stylesheet = `
.${classes.root}{position:relative;min-width:0}
.${classes.trigger}{display:flex;align-items:center;gap:4px;min-width:0;max-width:220px;height:28px;padding:0 4px 0 8px;border:0;border-radius:24px;outline:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;font-weight:500;cursor:pointer}
.${classes.trigger}:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.${classes.trigger}:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}
.${classes.trigger}:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.${classes.triggerLabel}{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${classes.chevron}{flex:0 0 auto;color:var(--dsw-alias-label-caption);transition:transform 120ms ease}
.${classes.chevronOpen}{transform:rotate(180deg)}
.${classes.menu}{position:absolute;right:0;bottom:calc(100% + 8px);z-index:20;display:flex;flex-direction:column;width:min(260px,calc(100vw - 32px));max-height:min(360px,calc(100vh - 96px));overflow:hidden;padding:4px;border:1px solid var(--dsw-alias-border-inverted);border-radius:12px;background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary)}
.${classes.status},.${classes.empty}{padding:10px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.${classes.error},.${classes.warning}{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;padding:7px 8px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.${classes.warning}{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}
.${classes.retry}{flex:0 0 auto;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}
.${classes.groups}{min-height:0;overflow-y:auto}
.${classes.group}+ .${classes.group}{margin-top:4px}
.${classes.groupTitle}{position:sticky;top:0;z-index:1;padding:5px 8px 3px;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;font-weight:500}
.${classes.option}{display:flex;align-items:center;gap:8px;width:100%;min-height:38px;padding:6px 8px;border:0;border-radius:10px;outline:0;background:transparent;color:inherit;text-align:left;cursor:pointer}
.${classes.option}:hover:not(:disabled),.${classes.option}:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.${classes.selected}{background:transparent}
.${classes.option}:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.${classes.optionCopy}{display:flex;flex:1;flex-direction:column;min-width:0}
.${classes.modelName}{overflow:hidden;color:inherit;font-size:14px;line-height:20px;font-weight:500;text-overflow:ellipsis;white-space:nowrap}
.${classes.description}{overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}
.${classes.check}{display:grid;place-items:center;flex:0 0 18px;color:var(--dsw-alias-label-primary)}
.${classes.evidenceWorkspace}{box-sizing:border-box;width:100%;min-height:100%;padding:20px;color:var(--dsw-alias-label-primary)}
.${classes.evidenceList}{display:flex;flex-direction:column;gap:16px;width:min(880px,100%);margin:0 auto}
.${classes.evidenceEmpty}{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:280px;padding:32px;color:var(--dsw-alias-label-tertiary);text-align:center}
.${classes.evidenceEmpty} strong{color:var(--dsw-alias-label-primary);font-size:16px;line-height:24px}
.${classes.evidenceEmpty} span{max-width:440px;font-size:13px;line-height:20px}
.${classes.evidenceRecord},.${classes.evidenceCallCard}{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.${classes.evidenceRecord}{padding:16px}
.${classes.evidenceCallCard}{width:100%;padding:12px}
.${classes.evidenceHeader}{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.${classes.evidenceTitle},.${classes.evidenceSectionTitle}{margin:0;font-weight:600}
.${classes.evidenceTitle}{font-size:14px;line-height:20px}
.${classes.evidenceSummary}{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;white-space:pre-wrap}
.${classes.evidenceOrigin}{flex:0 0 auto;padding:2px 7px;border-radius:999px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.${classes.evidenceThumbnails}{display:flex;gap:8px;margin-top:12px;overflow-x:auto}
.${classes.evidenceThumbnail},.${classes.evidenceThumbnailStatus}{box-sizing:border-box;flex:0 0 112px;width:112px;height:84px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform)}
.${classes.evidenceThumbnail}{display:block;object-fit:cover}
.${classes.evidenceThumbnailStatus}{position:relative;overflow:hidden}
.${classes.evidenceThumbnailStatus}[data-image-state="loading"]::after{position:absolute;inset:0;background:linear-gradient(90deg,transparent,var(--dsw-alias-interactive-bg-hover),transparent);content:"";animation:dsh-deepseek-vision-evidence-loading 1.2s ease-in-out infinite}
@keyframes dsh-deepseek-vision-evidence-loading{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
@media (prefers-reduced-motion:reduce){.${classes.evidenceThumbnailStatus}::after{animation:none}}
.${classes.evidenceSection}{margin-top:14px}
.${classes.evidenceSectionTitle}{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.${classes.evidenceAnswers},.${classes.evidenceUncertainties}{margin:6px 0 0;padding-left:20px;font-size:13px;line-height:20px}
.${classes.evidenceAnswers} li+li,.${classes.evidenceUncertainties} li+li{margin-top:7px}
.${classes.evidenceQuestion}{font-weight:600}
.${classes.evidenceAnswer},.${classes.evidenceMuted}{margin:2px 0 0;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}
.${classes.evidenceMuted}{font-size:13px;line-height:20px}
.${classes.evidenceOcr}{margin-top:14px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:10px}
.${classes.evidenceOcr} summary{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;cursor:pointer}
.${classes.evidenceOcr} summary:focus-visible{border-radius:4px;outline:2px solid var(--dsw-alias-border-l3);outline-offset:2px}
.${classes.evidenceOcr} pre{max-height:280px;overflow:auto;margin:8px 0 0;padding:10px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);font:12px/18px ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;word-break:break-word}
.${classes.evidenceRoute}{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.${classes.evidenceRoute} code{overflow:hidden;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;text-overflow:ellipsis;white-space:nowrap}
.${classes.evidenceCallStatus}{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
@media (max-width:640px){.${classes.evidenceWorkspace}{padding:12px}.${classes.evidenceHeader}{flex-direction:column}.${classes.evidenceOrigin}{align-self:flex-start}.${classes.evidenceRoute}{align-items:flex-start;flex-direction:column}}
`

/** Mount the stylesheet once and return an ownership-aware disposer. */
export function installStyles(): () => void {
  const id = 'dsh-deepseek-vision-styles'
  if (document.getElementById(id) !== null) return () => {}
  const style = document.createElement('style')
  style.id = id
  style.dataset.plugin = 'dsh-deepseek-vision'
  style.textContent = stylesheet
  document.head.appendChild(style)
  return () => { style.remove() }
}
