// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import { VisionModelSelect } from '../src/client/VisionModelSelect.tsx'
import type { VisionModelDirectoryState } from '../src/client/vision-directory.ts'
import { en } from '../src/client/locales.ts'
import { createSnapshotStore } from '../src/client/store.ts'
import type {} from '../src/client/index.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconCheckOutline16: ({ className }: { className?: string }) => <span aria-hidden className={className} />,
  IconChevronDownOutline14: ({ className }: { className?: string }) => <span aria-hidden className={className} />,
  IconWarningOutline16: ({ className }: { className?: string }) => <span aria-hidden className={className} />,
  Toast: () => null,
}))

const t: ComponentProps<typeof VisionModelSelect>['t'] = (key, params) => {
  const template = (en as Record<string, string>)[key] ?? key
  return params === undefined
    ? template
    : template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match)
}

function state(overrides: Partial<VisionModelDirectoryState> = {}): VisionModelDirectoryState {
  return {
    current: { provider: 'openrouter', model: 'vision-one' },
    groups: [{
      id: 'openrouter',
      name: 'OpenRouter',
      models: [
        { id: 'vision-one', name: 'Vision One', inputModalities: ['text', 'image'] },
        { id: 'vision-two', name: 'Vision Two', inputModalities: ['text', 'image'] },
      ],
    }],
    failures: [],
    available: true,
    writable: true,
    revision: 1,
    status: 'ready',
    error: null,
    ...overrides,
  }
}

afterEach(cleanup)

describe('VisionModelSelect', () => {
  it('opens a compact picker and applies the selected route', async () => {
    const directory = createSnapshotStore(state())
    const select = vi.fn(async (selection: ModelSelection) => {
      directory.set(state({ current: selection, revision: 2 }))
      return true
    })
    const load = vi.fn()
    render(<VisionModelSelect directory={directory} load={load} select={select} t={t} />)

    const trigger = screen.getByRole('button', { name: 'Select vision model, current Vision One' })
    expect(trigger.textContent).toBe('Vision: Vision One')
    fireEvent.click(trigger)
    expect(load).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('menu', { name: 'Vision model' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Vision Two' }))

    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({ provider: 'openrouter', model: 'vision-two' })
      expect(trigger.textContent).toBe('Vision: Vision Two')
    })
  })

  it('renders nothing when the Host does not expose the settings namespace', () => {
    const load = vi.fn()
    render(<VisionModelSelect
      directory={createSnapshotStore(state({ available: false }))}
      load={load}
      select={vi.fn().mockResolvedValue(false)}
      t={t}
    />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('searches models and filters them by provider', () => {
    const groups = [
      ...state().groups,
      { id: 'other', name: 'Other', models: [{ id: 'text-model', name: 'Text Model' }] },
    ]
    render(<VisionModelSelect
      directory={createSnapshotStore(state({ groups }))}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Select vision model, current Vision One' }))

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search vision models' }), {
      target: { value: 'text' },
    })
    expect(screen.getByRole('menuitemradio', { name: 'Text Model' })).toBeTruthy()
    expect(screen.queryByRole('menuitemradio', { name: 'Vision One' })).toBeNull()

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by provider' }), {
      target: { value: 'openrouter' },
    })
    expect(screen.getByText('No models match the current filters.')).toBeTruthy()
  })
})
