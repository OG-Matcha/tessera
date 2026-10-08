# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- A one-time reminder above the prompt when tessera was installed from GitHub and its marketplace has auto-update off, the Claude Code default for third-party marketplaces. It names the marketplace and the steps; **open /plugin** fills in the command, **not now** dismisses it. It reads your settings and writes nothing.
- The READMEs carry a measured token table: what each feature adds to the context or to separate model calls, and when.
- Fold long diffs (`foldDiffs`, on by default): an Edit or Write result over 12 diff lines shows up to 8 lines, the first of what was removed and of what was added, with the counts and an **expand** button, so one large edit no longer fills the screen. ctrl+o and `--verbose` show diffs whole, and what Claude reads is unchanged.

### Changed

- `agentModel: auto` sends Haiku the first 2,000 characters of an agent's task instead of 4,000: the difficulty shows in the description and opening, and a long CJK prompt cost up to twice the tokens.

### Fixed

- The feedback inbox's `inbox_fixed` tool failed every call: it answered with a whole MCP result object where Claude Code takes the text.

## [0.5.0] - 2026-10-08

### Changed

- The glossary guard (`guardGlossary`) is off by default: it needs a table in the project's `CLAUDE.md` and fits few setups. Turn it on in `/tessera setup`.
- The READMEs sort features into three tiers: the main features, safety nets on by default, and optional ones off by default. The problem table at the top lists only what most people hit.

### Fixed

- Carry over tasks kept offering tasks already done when tessera was reloaded mid-session (`/reload-plugins`, an update): the reloaded module lost the task ids, so later completions went unrecorded. The task list is now kept with its ids and picked back up on reload.
- tessera's own text (the carry-over band, toasts) was English at the start of a session for people who write Chinese on an English system locale, until their first prompt. The language they last wrote in is remembered and used from the start.

## [0.4.0] - 2026-10-08

### Added

- Carry over tasks also works after `/clear`: the fresh conversation offers what the cleared one left open, and no longer records the cleared conversation's tasks as its own.
- `agentModel: auto`: an Agent call with no model, for a general-purpose agent, gets haiku, sonnet, opus or fable picked from its task by one Haiku classification, and a toast names the pick. Agent types with their own model are left alone, and a failed classification lets the call through unchanged. `/tessera setup` now turns the feature on as `auto`.

### Fixed

- The reply-language note, sent once per context, stopped holding in long sessions and Claude drifted back to English. It is now sent again whenever Claude's last reply was in another language than the person's own words.

### Changed

- `agentModel` defaults to `auto`. A Workflow script whose `agent()` calls name no model is reminded once under `auto` and runs as written when sent again; `choose` still refuses until each names one.

## [0.3.1] - 2026-10-08

### Changed

- Carry over tasks turns on Claude's task tools for the session (`CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, process only, never written to settings) when the person has not set that variable, since Claude Code leaves them off for Claude 5.x and the feature had nothing to keep there.
- The Chinese `/tessera demo` no longer shows the Workflow desk, removed before 0.1.0, in its table and flowchart; the plugin description mentions text previews and carry-over.

## [0.3.0] - 2026-10-08

### Fixed

- Collapsed pasted text (`[Pasted text #n +N lines]`) now shows its first lines above the prompt. Claude Code sends no edit event for a collapsed paste, so the preview never appeared outside tests; the text now comes from the clipboard, read once per paste, and is shown only when its line count matches the placeholder.

### Added

- Carry over tasks (`carryOver`, on by default): what a session's task list (TaskCreate, TaskUpdate, TodoWrite) leaves open is kept per repository, and the next session there offers it above the prompt, to continue in the prompt box or dismiss. Claude Code gives Claude these tools by default only on older models; on Claude 5.x they need `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, and without them the feature records nothing.
- Glossary guard (`guardGlossary`, on by default): a table in the repository's `CLAUDE.md` with a column of terms to use and a column of wordings to avoid (`| Use | Avoid |` or `| 用語 | 避免 |`) becomes the project glossary; a file write that brings in an avoided wording is refused once with the term to use. Wordings the file already uses pass, Latin words match only as whole words, and a project without such a table is untouched.

## [0.2.0] - 2026-10-08

### Added

- Traditional Chinese guard (`guardSimplified`, auto by default): while the person writes Traditional Chinese, a write that puts Simplified-only characters or zh-CN software terms (服務器, 默認, 視頻) into a file is refused with the zh-TW forms. Files named for zh-CN, zh-SG or zh-Hans, files already in Simplified, terms the file already uses and lines with kana are left alone; the same call sent again goes through, for intended quotes.
- Heredoc guard (`guardHeredoc`, on by default): a Bash heredoc with an unquoted delimiter whose body holds `${...}`, `$(...)`, backticks or backslash escapes is refused, since the shell rewrites them before the file is written; sending the same command again lets an intended expansion through.

### Fixed

- The plugin and marketplace descriptions no longer mention the Workflow desk, which was removed before 0.1.0.

## [0.1.1] - 2026-10-08

### Fixed

- Chinese, Japanese and Korean category labels on mermaid bar and line charts sit under their bars instead of drifting right.

## [0.1.0] - 2026-10-08

### Added

- Themed replies: tables, headings, Prism-highlighted code, mermaid flowcharts and charts, tool rows and copy buttons, adapted from [prismantis](https://github.com/NahumLitvin/prismantis). Tables and mermaid boxes measure CJK characters, Extension B and later included, as two columns.
- Paste previews: pasted images as thumbnails above the prompt, real pixels where kitty graphics draw (kitty, Ghostty) and quadrant-block cell art everywhere else; an "original" button opens the file in an Orca tab, a VS Code tab or the system viewer. Pasted text the editor collapses to `[Pasted text #n]` shows its first lines ([anthropics/claude-code#23134](https://github.com/anthropics/claude-code/issues/23134)).
- Guards: while agents run, git commands that rewrite the main working tree and `git add -A` are refused; junctions or symlinks to `node_modules`, and recursive deletes whose target holds a link, always are. Korean, Chinese or Japanese written as `\uXXXX` escapes is refused ([anthropics/claude-code#83033](https://github.com/anthropics/claude-code/issues/83033)). Optional: Agent and Workflow calls must name a model; a Workflow script must quote the person.
- Reply language: when the person's own words, pasted material set aside, are Chinese, Japanese or Korean, Claude is asked to reply in that language.
- Prompt cards: a prompt written for another agent or tool draws as a card with a token estimate and a copy button; `/tessera copy prompt` copies it.
- `/tessera peek <file>`: Markdown, CSV, JSON, docx, xlsx and pptx summarized in the terminal.
- Optional client feedback inbox: pasted chat logs become numbered items per repository, and a complaint resembling a fixed item is flagged as a likely regression.
- Optional resume after limits: a rate-limit stop continues the work after the reset ([anthropics/claude-code#13354](https://github.com/anthropics/claude-code/issues/13354)).
- `/tessera setup` switches features on and off; a feature that is off registers nothing. Typeahead for `/tessera` subcommands. English and Traditional Chinese throughout.

### Requires

- Claude Code 2.1.292 or later, the first release with the prompt typeahead event.

[Unreleased]: https://github.com/OG-Matcha/tessera/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/OG-Matcha/tessera/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/OG-Matcha/tessera/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/OG-Matcha/tessera/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/OG-Matcha/tessera/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/OG-Matcha/tessera/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/OG-Matcha/tessera/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/OG-Matcha/tessera/releases/tag/v0.1.0
