import type { TestBody } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

import { marketplaceWithoutUpdates } from '../hooks/update'

const github = (autoUpdate?: boolean) => ({ extraKnownMarketplaces: { mine: { source: { source: 'github', repo: 'OG-Matcha/tessera' }, autoUpdate } } })

test('a GitHub install of tessera without auto-update is found under any marketplace name', () => {
  expect(marketplaceWithoutUpdates(github())).toBe('mine')
  expect(marketplaceWithoutUpdates(github(true))).toBe(undefined)
  expect(marketplaceWithoutUpdates({ extraKnownMarketplaces: { t: { source: { source: 'git', url: 'https://github.com/og-matcha/tessera.git' } } } })).toBe('t')
})

test('a local folder, another marketplace or no settings ask nothing', () => {
  expect(marketplaceWithoutUpdates({ extraKnownMarketplaces: { tessera: { source: { source: 'directory', path: 'I:/tessera' } } } })).toBe(undefined)
  expect(marketplaceWithoutUpdates({ extraKnownMarketplaces: { other: { source: { source: 'github', repo: 'a/b' } } } })).toBe(undefined)
  expect(marketplaceWithoutUpdates({})).toBe(undefined)
})

const start = (store: Record<string, unknown>, settings: unknown) => async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1]) => {
  const written: Record<string, unknown> = {}
  on('env.get', () => ({ value: '1' }) as never)
  on('settings.read', () => ({ value: settings }) as never)
  on('store.get', (_, e) => ({ value: store[String((e as { key?: string }).key)] }) as never)
  on('store.set', (_, e) => {
    written[String((e as { key?: string }).key)] = (e as { value?: unknown }).value
    return { value: undefined } as never
  })
  on('session.start', () => ({ cwd: '/tmp' }))
  on('prompt.fill', () => ({ isFilled: true }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, availableRows: 20 }, viewport: { columns: 80, rows: 20 } } as never)
  return { ui, written }
}

test('a returning session offers auto-update once, and a press settles it', { options: { language: 'en', carryOver: false } }, async ($, on) => {
  const { ui, written } = await start({ setupSeen: true }, github())($, on)
  const open = await ui.find({ type: 'Button', label: 'open /plugin' } as never)
  expect(open).toBeDefined()
  await ui.press({ key: open!.key! })
  expect(written.updateOffered).toBe(true)
  expect(await ui.find({ type: 'Button', label: 'open /plugin' } as never)).toBe(undefined)
})

const cases = [
  ['the first session', {}, github()],
  ['a session after it was answered', { setupSeen: true, updateOffered: true }, github()],
  ['auto-update on', { setupSeen: true }, github(true)],
] as const

for (const [when, store, settings] of cases)
  test(`no offer in ${when}`, { options: { language: 'en', carryOver: false } }, async ($, on) => {
    const { ui } = await start(store, settings)($, on)
    expect(await ui.find({ type: 'Button', label: 'open /plugin' } as never)).toBe(undefined)
  })
