import { describe, expect, test } from 'claude-code/testing'

import { drawsPixels, opener, pasteRoot, platformOf } from '../hooks/platform'

const WINDOWS_TERMINAL = { OS: 'Windows_NT', TEMP: 'C:\\Users\\a\\AppData\\Local\\Temp', WT_SESSION: 'x', TERM: undefined }
const ORCA = { OS: 'Windows_NT', TEMP: 'C:\\temp', TERM: 'xterm-256color', TERM_PROGRAM: 'Orca' }
const VSCODE_WIN = { OS: 'Windows_NT', TEMP: 'C:\\t', TERM_PROGRAM: 'vscode' }
const ITERM = { HOME: '/Users/a', TERM: 'xterm-256color', TERM_PROGRAM: 'iTerm.app' }
const APPLE_TERMINAL = { HOME: '/Users/a', TERM: 'xterm-256color', TERM_PROGRAM: 'Apple_Terminal' }
const GHOSTTY = { HOME: '/Users/a', TERM: 'xterm-ghostty', TERM_PROGRAM: 'ghostty' }
const KITTY_LINUX = { HOME: '/home/a', TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1', XDG_CURRENT_DESKTOP: 'GNOME' }
const KITTY_IN_TMUX = { ...KITTY_LINUX, TERM: 'tmux-256color', TMUX: '/tmp/tmux-1000/default,1,0' }
const SSH_LINUX = { HOME: '/home/a', TERM: 'xterm-256color' }
const WSL = { HOME: '/home/a', WSL_DISTRO_NAME: 'Ubuntu', TERM: 'xterm-256color', WT_SESSION: 'x' }

describe('the platform', () => {
  test('is read from OS, WSL_DISTRO_NAME and HOME', () => {
    expect([WINDOWS_TERMINAL, ORCA, ITERM, KITTY_LINUX, WSL].map(platformOf)).toEqual(['windows', 'windows', 'mac', 'linux', 'wsl'])
  })
})

describe('the paste cache', () => {
  test('is %TEMP%\\claude on Windows and /tmp/claude-<uid> elsewhere', () => {
    expect(pasteRoot(WINDOWS_TERMINAL)).toBe('C:/Users/a/AppData/Local/Temp/claude')
    expect(pasteRoot(ORCA)).toBe('C:/temp/claude')
    expect(pasteRoot(ITERM)).toBe('/tmp/claude-{uid}')
    expect(pasteRoot(WSL)).toBe('/tmp/claude-{uid}')
  })
  test('follows CLAUDE_CODE_TMPDIR everywhere', () => {
    expect(pasteRoot({ ...ORCA, CLAUDE_CODE_TMPDIR: 'D:\\tmp' })).toBe('D:/tmp')
  })
})

describe('real pixels', () => {
  test('draw only in kitty and Ghostty, never inside tmux or screen', () => {
    const auto = (env: Record<string, string | undefined>) => drawsPixels('auto', env)
    expect([GHOSTTY, KITTY_LINUX].map(auto)).toEqual([true, true])
    expect([WINDOWS_TERMINAL, ORCA, VSCODE_WIN, ITERM, APPLE_TERMINAL, SSH_LINUX, WSL, KITTY_IN_TMUX].map(auto)).toEqual(Array(8).fill(false))
    expect(auto({ ...KITTY_LINUX, STY: '1.pts' })).toBe(false)
  })
  test('the setting and CLAUDE_CODE_FORCE_TERMINAL_IMAGES override detection', () => {
    expect(drawsPixels('pixels', ORCA)).toBe(true)
    expect(drawsPixels('cells', GHOSTTY)).toBe(false)
    expect(drawsPixels('auto', { ...KITTY_IN_TMUX, CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' })).toBe(true)
  })
})

describe('the original', () => {
  test('opens with each platform\'s viewer', () => {
    expect(opener(ORCA, 'C:/temp/claude/p/s/images/1.png')).toEqual(['explorer.exe', 'C:\\temp\\claude\\p\\s\\images\\1.png'])
    expect(opener(ITERM, '/tmp/claude-501/p/s/images/1.png')).toEqual(['open', '/tmp/claude-501/p/s/images/1.png'])
    expect(opener(KITTY_LINUX, '/tmp/x.png')).toEqual(['xdg-open', '/tmp/x.png'])
    expect(opener(WSL, '/tmp/claude-1000/1.png')).toEqual(['explorer.exe', '\\\\wsl.localhost\\Ubuntu\\tmp\\claude-1000\\1.png'])
  })
})
