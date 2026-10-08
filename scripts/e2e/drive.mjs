// Runs Claude Code in a pseudo-terminal and reads its screen the way a person would see it.
import { execFileSync } from 'node:child_process'
import { platform } from 'node:os'

import pty from '@homebridge/node-pty-prebuilt-multiarch'
import xterm from '@xterm/headless'

const COLS = 110
const ROWS = 40
const sleep = ms => new Promise(r => setTimeout(r, ms))

export const PASTE = text => `\x1b[200~${text.split('\n').join('\r')}\x1b[201~`
export const CLICK = (col, row) => `\x1b[<0;${col};${row}M\x1b[<0;${col};${row}m`
export const ALT_V = '\x1bv'

const powershell = command => execFileSync('powershell', ['-NoProfile', '-Sta', '-Command', command])

// Clipboard writes are only scripted on Windows; scenarios that need them are skipped elsewhere.
export const canSetClipboard = platform() === 'win32'
export const clipboardText = path => powershell(`Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 '${path}')`)
export const clipboardImage = path =>
  powershell(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing; [Windows.Forms.Clipboard]::SetImage([Drawing.Image]::FromFile('${path}'))`)
export const readClipboard = () => powershell('[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-Clipboard -Raw').toString('utf8')

// Clicks the last reply's copy button where it is drawn on screen. A terminal copy reaches the system
// clipboard directly or as an OSC 52 request the terminal carries out, so both are read back.
async function pressCopyReply(term, write, osc52) {
  const buffer = term.buffer.active
  let rows = []
  let row = -1
  for (const end = Date.now() + 5_000; row === -1 && Date.now() < end; await sleep(250)) {
    rows = Array.from({ length: ROWS }, (_, i) => buffer.getLine(buffer.viewportY + i)?.translateToString(true) ?? '')
    row = rows.findLastIndex(l => l.includes('⧉ copy reply'))
  }
  if (row === -1) return `no copy reply button on screen:\n${rows.filter(l => l.trim()).slice(-12).join('\n')}`
  write(CLICK(rows[row].indexOf('⧉ copy reply') + 1, row + 1))
  await sleep(1_500)
  return `${osc52()}\n${readClipboard()}`
}

export async function session({ cwd, args = [], env = {}, steps }) {
  const term = new xterm.Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true })
  const childEnv = { ...process.env, ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
  for (const k of Object.keys(childEnv)) if (/^(CLAUDECODE|CLAUDE_CODE_ENTRYPOINT|CLAUDE_CODE_CHILD_SESSION|ORCA|TERM_PROGRAM|WT_SESSION)/.test(k)) delete childEnv[k]
  const [file, argv] = platform() === 'win32' ? ['cmd.exe', ['/c', 'claude', ...args]] : ['claude', args]
  const child = pty.spawn(file, argv, { name: 'xterm-256color', cols: COLS, rows: ROWS, cwd, env: childEnv })
  let osc52 = ''
  child.onData(d => {
    term.write(d)
    const copied = /\x1b\]52;[^;]*;([A-Za-z0-9+/=]+)(?:\x07|\x1b\\)/.exec(d)
    if (copied) osc52 = Buffer.from(copied[1], 'base64').toString('utf8')
  })

  const screen = () =>
    new Promise(r =>
      term.write('', () => r(Array.from({ length: term.buffer.active.length }, (_, i) => term.buffer.active.getLine(i)?.translateToString(true) ?? '').join('\n'))),
    )
  const until = async (pattern, timeoutMs) => {
    for (const end = Date.now() + timeoutMs; Date.now() < end; await sleep(500)) if (pattern.test(await screen())) return true
    return false
  }

  const shots = {}
  try {
    // A new directory asks for trust first; its menu has a ❯ too, so the prompt counts only once it is gone.
    // Enter goes only once the cursor sits on "Yes": the menu can draw before it takes keys.
    const view = async () => {
      await screen()
      return Array.from({ length: ROWS }, (_, i) => term.buffer.active.getLine(term.buffer.active.viewportY + i)?.translateToString(true) ?? '').join('\n')
    }
    for (const end = Date.now() + 45_000; Date.now() < end; await sleep(500)) {
      const text = await view()
      if (/❯ Yes, I trust this folder/.test(text)) child.write('\r')
      else if (/trust this folder/.test(text)) child.write('\x1b[B')
      else if (/^❯ /m.test(text)) break
    }
    await sleep(3_000)
    for (const step of steps) {
      if (step.run) step.run()
      if (step.type) for (const ch of step.type) (child.write(ch), await sleep(15))
      if (step.key) child.write(step.key)
      if (step.until) shots[step.name ?? 'until'] = { matched: await until(step.until, step.timeoutMs ?? 60_000) }
      if (step.wait) await sleep(step.wait)
      if (step.shot) shots[step.shot] = { ...shots[step.shot], text: await screen() }
      if (step.copyReply) shots.clipboard = await pressCopyReply(term, data => child.write(data), () => osc52)
    }
  } finally {
    // claude runs as a child of cmd on Windows, so the whole tree goes, or it keeps the directory busy.
    if (platform() === 'win32') {
      try {
        execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      } catch {
        child.kill()
      }
    } else child.kill()
  }
  return shots
}
