export type Env = Record<string, string | undefined>

export type Platform = 'windows' | 'wsl' | 'mac' | 'linux'

export function platformOf(env: Env): Platform {
  if (env.OS === 'Windows_NT') return 'windows'
  if (env.WSL_DISTRO_NAME !== undefined) return 'wsl'
  if (env.HOME?.startsWith('/Users/')) return 'mac'
  return 'linux'
}

// Where Claude Code caches pastes: %TEMP%\claude on Windows, /tmp/claude-<uid> elsewhere ({uid} is filled in by the caller).
export function pasteRoot(env: Env): string {
  if (env.CLAUDE_CODE_TMPDIR) return env.CLAUDE_CODE_TMPDIR.replace(/\\/g, '/')
  if (platformOf(env) === 'windows' && env.TEMP) return `${env.TEMP.replace(/\\/g, '/')}/claude`
  return '/tmp/claude-{uid}'
}

// Whether Claude Code's Image element will show real pixels: kitty graphics outside a multiplexer, or forced on.
export function drawsPixels(mode: string, env: Env): boolean {
  if (mode === 'pixels') return true
  if (mode === 'cells') return false
  if (env.CLAUDE_CODE_FORCE_TERMINAL_IMAGES === '1') return true
  if (env.TMUX !== undefined || env.STY !== undefined) return false
  return env.TERM === 'xterm-kitty' || env.TERM === 'xterm-ghostty' || env.TERM_PROGRAM === 'ghostty' || env.KITTY_WINDOW_ID !== undefined
}

const fileUrl = (path: string) => `file:///${encodeURI(path.replace(/\\/g, '/').replace(/^\//, ''))}`

// Commands to try in order: a tab inside the app hosting the terminal (Orca, VS Code), then the system viewer.
export function openers(env: Env, path: string): string[][] {
  const host: string[][] = []
  if (env.TERM_PROGRAM === 'Orca') host.push(['orca', 'tab', 'create', '--url', fileUrl(path)])
  if (env.TERM_PROGRAM === 'vscode') host.push(platformOf(env) === 'windows' ? ['cmd', '/c', 'code', '--reuse-window', path] : ['code', '--reuse-window', path])
  return [...host, opener(env, path)]
}

// The command that opens a file in the system's picture viewer.
function opener(env: Env, path: string): string[] {
  switch (platformOf(env)) {
    case 'windows':
      return ['explorer.exe', path.replace(/\//g, '\\')]
    case 'wsl':
      return ['explorer.exe', `\\\\wsl.localhost\\${env.WSL_DISTRO_NAME}${path.replace(/\//g, '\\')}`]
    case 'mac':
      return ['open', path]
    case 'linux':
      return ['xdg-open', path]
  }
}
