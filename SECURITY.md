# Security

tessera runs inside Claude Code with your user's permissions. Report a vulnerability privately through [GitHub's security advisories](https://github.com/OG-Matcha/tessera/security/advisories/new), not in a public issue. Expect a first answer within a week.

## What tessera does on your machine

- **Network:** none. tessera makes no network requests.
- **Files read:** the paste cache Claude Code writes (`%TEMP%\claude` on Windows, `/tmp/claude-<uid>` elsewhere), the session's Workflow scripts when a Workflow starts, a file you name in `/tessera peek`, the paths a recursive delete would remove, and, while the Traditional Chinese or glossary guard is on, the repository's `CLAUDE.md` and a file Claude is about to write Simplified characters, zh-CN terms or avoided glossary wordings into.
- **Clipboard:** read, never written, except when you press a copy button.
- **Files written:** none outside Claude Code's own plugin store.
- **Commands run:** `git rev-parse` to tell a main tree from a worktree; `dir /AL /S /B` (Windows) or `find -type l` (elsewhere) to look for links before a recursive delete; `id -u` on macOS and Linux to find the paste cache; once per collapsed text paste, the clipboard reader for your platform (`powershell Get-Clipboard`, `pbpaste`, `wl-paste`, `xclip` or `xsel`), whose text is shown only when its line count matches the paste; and, when you press "original", the viewer for your platform (`orca tab create`, `code`, `explorer.exe`, `open` or `xdg-open`). Arguments are passed as an argument list, never through a shell string.
- **Environment:** while carry-over is on and you have not set it yourself, `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` for the Claude Code process, so Claude has its task tools; nothing is written to your settings files.
- **Model calls:** with `agentModel: auto`, one short Haiku classification per Agent call that names no model, through your own Claude Code session.
- **Model context:** tessera adds short notes to your prompts (the diagram hint, the reply-language note, inbox notes), each switchable in `/tessera setup`.

## Supported versions

Only the latest release gets fixes.
