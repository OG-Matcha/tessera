# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-10-08

### Added

- Traditional Chinese guard (`guardSimplified`, auto by default): while the person writes Traditional Chinese, a write that puts Simplified-only characters or zh-CN software terms (服務器, 默認, 視頻) into a file is refused with the zh-TW forms. Files named for zh-CN, zh-SG or zh-Hans, files already in Simplified, terms the file already uses and lines with kana are left alone; the same call sent again goes through, for intended quotes.
- Heredoc guard (`guardHeredoc`, on by default): a Bash heredoc with an unquoted delimiter whose body holds `${...}`, `$(...)`, backticks or backslash escapes is refused, since the shell rewrites them before the file is written; sending the same command again lets an intended expansion through.

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

[Unreleased]: https://github.com/OG-Matcha/tessera/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/OG-Matcha/tessera/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/OG-Matcha/tessera/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/OG-Matcha/tessera/releases/tag/v0.1.0
