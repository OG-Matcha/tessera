# Privacy

tessera runs inside Claude Code on your machine and collects nothing.

- **No data leaves your machine through tessera.** It makes no network requests and runs no server. Its one model call, a short Haiku classification per Agent call that names no model, goes through your own Claude Code session, under Anthropic's terms for that session.
- **What it keeps, where:** Claude Code's plugin store on your machine holds the tasks a session left open (per repository, the newest thirty), the path, time and session id of each file Claude edits (for 30 minutes, while the session guard is on), and small flags such as whether the setup hint was shown. Nothing is kept anywhere else, and uninstalling the plugin removes the store.
- **What it reads:** your Claude Code `language` setting and the marketplace's auto-update setting, Claude Code's paste cache and its list of running sessions, the clipboard once per collapsed text paste, files you name in `/tessera peek`, and the files a guard has to look at before a command runs. [SECURITY.md](SECURITY.md) lists each of these with its reason.
- **Prompt log** (`/tessera log`) keeps the prompts you send (up to the first 10,000 characters of each), and the first line of each reply, in the session's memory only: nothing is written to disk, and it is gone when the session ends.
- **Record mode** (`/tessera record`) masks keys, emails and phone numbers on screen only; it stores and sends nothing.
- **Analytics, telemetry, accounts:** none.
- **Children:** tessera is a developer tool and is not directed at people under 18.

Questions go to [GitHub issues](https://github.com/OG-Matcha/tessera/issues). This page changes only with a release, and the [changelog](CHANGELOG.md) notes it when it does.
