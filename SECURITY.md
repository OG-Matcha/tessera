# Security

tessera runs inside Claude Code with your user's permissions. Report a vulnerability privately through [GitHub's security advisories](https://github.com/OG-Matcha/tessera/security/advisories/new), not in a public issue. Expect a first answer within a week.

## What tessera does on your machine

- **Network:** none. tessera makes no network requests.
- **Files read:** the paste cache Claude Code writes (`%TEMP%\claude` on Windows, `/tmp/claude-<uid>` elsewhere), the session's Workflow scripts when a Workflow starts, a file you name in `/tessera peek`, the paths a recursive delete would remove, and, while the Simplified guard is on, a file Claude is about to write Simplified characters into.
- **Files written:** none outside Claude Code's own plugin store.
- **Commands run:** `git rev-parse` to tell a main tree from a worktree; `dir /AL /S /B` (Windows) or `find -type l` (elsewhere) to look for links before a recursive delete; `id -u` on macOS and Linux to find the paste cache; and, when you press "original", the viewer for your platform (`orca tab create`, `code`, `explorer.exe`, `open` or `xdg-open`). Arguments are passed as an argument list, never through a shell string.
- **Model context:** tessera adds short notes to your prompts (the diagram hint, the reply-language note, inbox notes), each switchable in `/tessera setup`.

## Supported versions

Only the latest release gets fixes.
