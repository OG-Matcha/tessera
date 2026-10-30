import type { TestBody } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

import { clipboardHolds, latestPaste, placeholders, projectFolder } from '../hooks/paste'
import { clipboardReaders } from '../hooks/platform'

test('a project folder is the working directory with every non-alphanumeric character made a dash', () => {
  expect(projectFolder('I:\\接案\\orca')).toBe('I-----orca')
  expect(projectFolder('/Users/a/my.app')).toBe('-Users-a-my-app')
})

test('of the same image number in several project folders, the one written last is shown', () => {
  const old = { project: 'I--old', path: 'old/8.png', mtimeMs: 1_000, size: 10 }
  const fresh = { project: 'I--new', path: 'new/8.png', mtimeMs: 2_000, size: 10 }
  expect(latestPaste([old, fresh], undefined)).toBe(fresh)
  expect(latestPaste([fresh, old], 'I--old')).toBe(fresh)
  expect(latestPaste([old], 'I--new')).toBe(old)
  expect(latestPaste([], 'I--new')).toBe(undefined)
})

test('with no time to tell them apart, the working directory folder wins, then the first found', () => {
  const a = { project: 'A', path: 'a/1.png', mtimeMs: 0, size: 1 }
  const b = { project: 'B', path: 'b/1.png', mtimeMs: 0, size: 1 }
  expect(latestPaste([a, b], 'B')).toBe(b)
  expect(latestPaste([a, b], 'C')).toBe(a)
})

test('placeholders give each paste once, with the extra line count Claude Code states', () => {
  expect(placeholders('a [Pasted text #1 +40 lines] b [Pasted text #3] [Pasted text #1 +40 lines]')).toEqual([
    { n: 1, extraLines: 40 },
    { n: 3, extraLines: undefined },
  ])
})

test('the clipboard counts as the paste only with the stated line count', () => {
  const thirty = Array.from({ length: 30 }, (_, i) => `line ${i}`)
  expect(clipboardHolds(thirty.join('\r\n') + '\r\n', 29)).toBe(true)
  expect(clipboardHolds(thirty.join('\n') + '\n\r\n', 29)).toBe(true)
  expect(clipboardHolds(thirty.join('\n'), 30)).toBe(true)
  expect(clipboardHolds(thirty.join('\n'), 27)).toBe(false)
  expect(clipboardHolds('x'.repeat(1200), undefined)).toBe(true)
  expect(clipboardHolds('a\nb', undefined)).toBe(false)
  expect(clipboardHolds('', 0)).toBe(false)
})

test('the clipboard is read as UTF-8 on Windows and through the usual tools elsewhere', () => {
  expect(clipboardReaders({ OS: 'Windows_NT' })[0]?.join(' ')).toContain('[Console]::OutputEncoding = [Text.Encoding]::UTF8')
  expect(clipboardReaders({ HOME: '/home/a', TERM: 'xterm' }).map(a => a[0])).toEqual(['wl-paste', 'xclip', 'xsel'])
})

// The paste drafts as given, the image list empty and every other state key unset.
const draft = (key: string | undefined, pasted: unknown) => (key === 'draftPastes' ? pasted : key === 'draftImages' || key === 'quietTasks' ? [] : null)

test('collapsed pasted text shows its first lines and its length above the prompt', { options: { language: 'en' } }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const pasted = [{ n: 2, total: 40, head: ['Error: boom', '  at main (a.ts:1:1)'] }]
  on('state.get', (_, e) => ({ value: { value: draft((e as { key?: string }).key, pasted), version: 1 } }) as never)
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, availableRows: 20 }, viewport: { columns: 80, rows: 20 } } as never)
  expect(await ui.find({ type: 'Text', text: 'Pasted text #2 · 40 lines' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Error: boom' })).toBeDefined()
})

test('another plugin above the prompt still draws under the paste preview', { options: { language: 'en' } }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>other band</Text>
  })
  const pasted = [{ n: 1, total: 30, head: ['line one'] }]
  on('state.get', (_, e) => ({ value: { value: draft((e as { key?: string }).key, pasted), version: 1 } }) as never)
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, availableRows: 20 }, viewport: { columns: 80, rows: 20 } } as never)
  expect(await ui.find({ type: 'Text', text: 'line one' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'other band' })).toBeDefined()
  await ui.unmount()
})


type On = Parameters<TestBody>[1]
type Files = Record<string, { mtimeMs: number; size: number }>
const slashed = (path: string) => path.replace(/\\/g, '/')
const OPTIONS = { language: 'en', imageMode: 'pixels', carryOver: false, backgroundWatch: false, cacheClock: false } as const
// The paste cache on Windows, in a session started in C:/w/new: files maps <project>/s1/images/<n>.png
// to its time and size, and every project folder named there holds an images folder of session s1.
const pasteCache = (on: On, files: Files, draft: { text: string }) => {
  const lists: string[] = []
  const reads: string[] = []
  const at = (e: unknown) => {
    const path = slashed((e as { path: string }).path)
    return Object.entries(files).find(([tail]) => path.endsWith(`/${tail}`))?.[1]
  }
  on('env.get', (_, e) => ({ value: { OS: 'Windows_NT', TEMP: 'C:/tmp' }[(e as { name: string }).name] }) as never)
  on('session.start', () => ({ cwd: 'C:/w/new' }))
  on('session.id', () => ({ value: 's1' }) as never)
  on('session.cwd', () => ({ value: 'C:/w/new' }) as never)
  on('prompt.read', () => ({ value: draft }) as never)
  on('fs.list', (_, e) => {
    const path = slashed((e as { path: string }).path)
    lists.push(path)
    return { value: path.endsWith('/tmp/claude') ? [...new Set(Object.keys(files).map(tail => tail.split('/')[0]!))].map(name => ({ name, kind: 'dir' })) : [] } as never
  })
  on('fs.exists', (_, e) => {
    const path = slashed((e as { path: string }).path)
    return { value: path.endsWith('/s1/images') ? Object.keys(files).some(tail => path.endsWith(`/${tail.split('/')[0]}/s1/images`)) : at(e) !== undefined } as never
  })
  on('fs.stat', (_, e) => {
    const file = at(e)
    return (file === undefined ? Promise.reject(new Error('ENOENT')) : { value: { kind: 'file', isLink: false, ...file } }) as never
  })
  on('fs.read', (_, e) => {
    reads.push(slashed((e as { path: string }).path))
    return { value: { base64: '' } } as never
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return { lists, reads }
}

// The file of each image drawn above the prompt, as <project>/<n>.png.
const shownImages = async ($: Parameters<TestBody>[0]) => {
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, availableRows: 20 }, viewport: { columns: 100, rows: 20 } } as never)
  const images = (await ui.findAll({ type: 'Image' } as never)) as { props?: { source?: { file?: string } } }[]
  await ui.unmount()
  return images.map(image => slashed(String(image.props?.source?.file)).replace(/^.*\/([^/]+)\/s1\/images\//, '$1/'))
}

test('an image number pasted again in another project folder of the same session shows the new paste, not the old one listed first', { options: OPTIONS }, async ($, on) => {
  const clock = mock.clock(on)
  // A resumed session: #8..#11 pasted today under the working directory, 1..13.png from days ago under the old one.
  const files: Files = {}
  for (let n = 1; n <= 13; n++) files[`C--w-old/s1/images/${n}.png`] = { mtimeMs: 1_000 + n, size: 50 }
  for (let n = 8; n <= 11; n++) files[`C--w-new/s1/images/${n}.png`] = { mtimeMs: 9_000 + n, size: 70 }
  pasteCache(on, files, { text: '[Image #8] [Image #9] [Image #10] [Image #11] [Image #2]' })
  await $.session.start({ cwd: 'C:/w/new', surface: 'terminal', isInteractive: true })
  await clock.advance(1_000)
  expect(await shownImages($)).toEqual(['C--w-new/8.png', 'C--w-new/9.png', 'C--w-new/10.png', 'C--w-new/11.png', 'C--w-old/2.png'])
})

test('a paste written after its placeholder, or over an older file, replaces the preview within seconds', { options: OPTIONS }, async ($, on) => {
  const clock = mock.clock(on)
  const files: Files = { 'C--w-old/s1/images/8.png': { mtimeMs: 1_000, size: 50 } }
  const { reads } = pasteCache(on, files, { text: '[Image #8]' })
  await $.session.start({ cwd: 'C:/w/new', surface: 'terminal', isInteractive: true })
  await clock.advance(1_000)
  expect(await shownImages($)).toEqual(['C--w-old/8.png'])
  // The working directory's folder did not exist at the first listing; it is looked in all the same.
  files['C--w-new/s1/images/8.png'] = { mtimeMs: 9_000, size: 70 }
  await clock.advance(2_500)
  expect(await shownImages($)).toEqual(['C--w-new/8.png'])
  // The same file written over: the same path, read again for its new thumbnail.
  const readsBefore = reads.length
  files['C--w-new/s1/images/8.png'] = { mtimeMs: 12_000, size: 90 }
  await clock.advance(2_500)
  expect(await shownImages($)).toEqual(['C--w-new/8.png'])
  expect(reads.length).toBe(readsBefore + 1)
})

test('the temp root is listed again for a new draft or a missing image, not every quarter second', { options: OPTIONS }, async ($, on) => {
  const clock = mock.clock(on)
  const files: Files = { 'C--w-new/s1/images/1.png': { mtimeMs: 1_000, size: 50 } }
  const draft = { text: '[Image #1]' }
  const { lists } = pasteCache(on, files, draft)
  await $.session.start({ cwd: 'C:/w/new', surface: 'terminal', isInteractive: true })
  await clock.advance(10_000)
  expect(await shownImages($)).toEqual(['C--w-new/1.png'])
  expect(lists).toHaveLength(1)
  // #2 lands in a folder of another project, after the draft names it.
  draft.text = '[Image #1] [Image #2]'
  await clock.advance(1_000)
  expect(lists).toHaveLength(2)
  files['C--w-other/s1/images/2.png'] = { mtimeMs: 2_000, size: 50 }
  await clock.advance(1_000)
  expect(lists.length).toBeLessThanOrEqual(3)
  await clock.advance(2_000)
  expect(await shownImages($)).toEqual(['C--w-new/1.png', 'C--w-other/2.png'])
  const settled = lists.length
  await clock.advance(10_000)
  expect(lists).toHaveLength(settled)
})
