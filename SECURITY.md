# Security

tessera runs inside Claude Code with your user's permissions. Report a vulnerability privately through [GitHub's security advisories](https://github.com/OG-Matcha/tessera/security/advisories/new), not in a public issue. Expect a first answer within a week.

## What tessera does on your machine

- **Network:** none. tessera makes no network requests.
- **Files read:** the paste cache Claude Code writes (`%TEMP%\claude` on Windows, `/tmp/claude-<uid>` elsewhere), the session's Workflow scripts when a Workflow starts, a file you name in `/tessera peek`, the paths a recursive delete would remove, and, while the Traditional Chinese or glossary guard is on, the repository's `CLAUDE.md` and a file Claude is about to write Simplified characters, zh-CN terms or avoided glossary wordings into.
- **Settings:** read, never written: your `language` setting, and the name and auto-update setting of the marketplace tessera came from.
- **Clipboard:** read, never written, except when you press a copy button or run `/tessera copy`.
- **Files written:** none outside Claude Code's own plugin store.
- **Commands run:** `git rev-parse` to tell a main tree from a worktree, to read the current branch before a force push that names none, `git status --porcelain`, `git diff --name-only` or `git clean -n` before a git command that discards changes, to name what it would lose, and to read the current commit when you run `/tessera inbox fixed`; `dir /AL /S /B` on Windows to look for junctions inside a directory before a recursive delete (elsewhere only the target itself is checked, with a stat); `id -u` on macOS and Linux to find the paste cache; once per collapsed text paste, the clipboard reader for your platform (`powershell Get-Clipboard`, `pbpaste`, `wl-paste`, `xclip` or `xsel`), whose text is shown only when its line count matches the paste; and, when you press "original", the viewer for your platform (`orca tab create`, `code`, `explorer.exe`, `open` or `xdg-open`). Arguments are passed as an argument list, never through a shell string.
- **Environment:** while carry-over is on and you have not set it yourself, `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` for the Claude Code process, so Claude has its task tools; on Windows, while Python in UTF-8 is on and you have not set it yourself, `PYTHONUTF8=1`, so the Python Claude runs uses UTF-8. Both reach the commands Claude runs in that session; nothing is written to your settings files.
- **Model calls:** with `agentModel: auto`, the default, one short Haiku classification per Agent call that names no model, through your own Claude Code session.
- **Model context:** tessera adds short notes to your prompts (the diagram hint, the reply-language note, inbox notes), each switchable in `/tessera setup`.

## Supported versions

Only the latest release gets fixes.
