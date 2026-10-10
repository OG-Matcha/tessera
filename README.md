<p align="center">
  <img src="docs/banner.svg" alt="tessera: one Claude Code mod for every terminal" width="100%">
</p>

<p align="center">
  <a href="https://github.com/OG-Matcha/tessera/actions/workflows/ci.yml"><img src="https://github.com/OG-Matcha/tessera/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/OG-Matcha/tessera/releases"><img src="https://img.shields.io/github/v/release/OG-Matcha/tessera?color=89b4fa" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/OG-Matcha/tessera?color=a6e3a1" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/Claude_Code-%E2%89%A52.1.292-cba6f7" alt="Claude Code 2.1.292 or later">
  <img src="https://img.shields.io/badge/Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-tested-94e2d5" alt="Windows, macOS and Linux">
</p>

<p align="center">
  <img src="docs/demo.gif" alt="tessera in Claude Code: a pasted 30-line log previewed above the prompt, a reply with a CJK-aligned table, the Traditional Chinese guard refusing a Simplified write, then a 32-line edit folded to its first changes" width="760">
  <br><sub>Recorded from real sessions in a plain terminal: a pasted log previewed before sending, a reply drawn with a CJK-aligned table, and the Traditional Chinese guard stopping a Simplified write once before Claude, told it is a quote, sends it again.</sub>
</p>

<p align="center">
  English · <a href="README.zh-TW.md">繁體中文</a>
</p>

**tessera** is a [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) that makes the terminal show what Claude Code hides and stops the mistakes that cost work: pasted images and text you can actually see, replies drawn with CJK-correct tables and diagrams, and guards for long multi-agent runs. One install, every feature switchable, nothing running that you turned off.

## What it fixes

| Problem | Where it is reported | tessera |
| --- | --- | --- |
| A pasted image shows as `[Image #1]` in most terminals | | Thumbnails above the prompt: real pixels in kitty and Ghostty, cell art everywhere else |
| Pasted text collapses to `[Pasted text #1 +40 lines]` before you send it | [#23134](https://github.com/anthropics/claude-code/issues/23134) | Its first lines shown above the prompt |
| Korean, Chinese or Japanese written as `\uXXXX` comes out as wrong characters | [#83033](https://github.com/anthropics/claude-code/issues/83033) | Such tool calls are refused before they write; in code, where an escape can be meant, reminded once |
| Claude answers a Chinese question in English because the pasted log was English | | Replies follow the language of your own words |
| Claude writes Simplified characters or zh-CN terms into a Traditional Chinese project | | The write is refused once, with the zh-TW forms |
| A new session or `/clear` loses track of what was left to do | | The unfinished tasks are offered back above the prompt |
| A long edit fills the screen with its diff | | The first lines of what was removed and added, the counts, and an expand button |
| The Read tool does not say which file it read | [#21151](https://github.com/anthropics/claude-code/issues/21151) | Tool rows name the file |
| Copying from the terminal brings indentation and trailing spaces | [#18170](https://github.com/anthropics/claude-code/issues/18170) | Copy buttons and `/tessera copy` copy clean text |

## Install

```sh
claude plugin marketplace add OG-Matcha/tessera
claude plugin install tessera@og-matcha --scope user
```

Start a new session, then run `/tessera setup` to pick the features you want.

To get new releases automatically, open `/plugin`, go to **Marketplaces**, choose **og-matcha** and select **Enable auto-update**. Claude Code leaves auto-update off for marketplaces other than Anthropic's own; tessera reminds you of it once, above the prompt, with a button that opens `/plugin`. Without it, update by hand:

```sh
claude plugin marketplace update og-matcha
claude plugin update tessera@og-matcha
```

Installed before 0.8.0 as `tessera@tessera`? The marketplace was renamed from `tessera` to `og-matcha`, so that another plugin named tessera can be added beside it, and the old install no longer updates. Move it once:

```sh
claude plugin uninstall tessera@tessera
claude plugin marketplace remove tessera
claude plugin marketplace add OG-Matcha/tessera
claude plugin install tessera@og-matcha --scope user
```

Claude Code keeps a plugin's option values with its install ID, so pick yours again with `/tessera setup` or `/plugin configure tessera@og-matcha`.

> [!IMPORTANT]
> tessera includes the reply rendering of [prismantis](https://github.com/NahumLitvin/prismantis) and the paste preview idea of [cc-mod-image-view](https://github.com/GGGODLIN/cc-mod-image-view). Uninstall those two first; two mods drawing the same part of the screen fight over it.

### For a team or an organization

To give every contributor of one repository tessera, put these two keys in the repository's `.claude/settings.json`. Claude Code registers the marketplace once a contributor trusts the folder, and because tessera's marketplace lists it by a relative path, it loads from the marketplace copy from the next session on, with no install step:

```json
{
  "extraKnownMarketplaces": {
    "og-matcha": { "source": { "source": "github", "repo": "OG-Matcha/tessera" } }
  },
  "enabledPlugins": { "tessera@og-matcha": true }
}
```

Option values can go beside them, under `pluginConfigs`, so the team shares one setup:

```json
{
  "pluginConfigs": { "tessera@og-matcha": { "options": { "guardGlossary": true, "language": "zh-TW" } } }
}
```

For a whole organization, the same `extraKnownMarketplaces` and `enabledPlugins` keys go into [managed settings](https://code.claude.com/docs/en/plugins/org), with `"autoUpdate": true` on the marketplace entry if you want releases to reach every machine. Two things to know before you do:

- An organization that sets `allowManagedModsOnly` refuses every mod installed from GitHub, tessera included. To run it as the organization's own, copy a release of this repository to an administrator-only directory on each machine and register that directory as the marketplace (`"source": { "source": "directory", "path": "/opt/claude-plugins/tessera" }`); tessera's marketplace lists it by a relative path, which is what makes it count as yours.
- tessera's guards remind; they are not enforcement. A reminder lets the same call through when it is sent again, and a mod can be turned off by whoever installed it. For a rule nobody can pass, use a `PreToolUse` hook in managed settings.

Before rolling it out, `claude plugin validate .` in a checkout lists every event tessera handles and every file, process, environment and settings call it makes, which [SECURITY.md](SECURITY.md) explains line by line.

## Features

| Feature | Default | What it does |
| --- | --- | --- |
| Themed replies | on | Tables, headings, highlighted code, mermaid diagrams and charts, tool rows, copy buttons; 16 themes |
| Fold long diffs | on | An Edit or Write diff over 12 lines shows up to 8 lines (the first of what was removed and of what was added), the counts, and **expand**; ctrl+o and `--verbose` show it whole. Display only: what Claude reads is unchanged |
| Paste previews | on | Image thumbnails and collapsed pasted text above the prompt (the text is read from the clipboard and shown only when it matches the paste's line count); "original" opens the full image in an Orca tab, a VS Code tab or your system viewer |
| Reply in my language | on | When your own words are Chinese, Japanese or Korean, Claude replies in that language; pasted code, logs and quotes do not count |
| Carry over tasks | on | A new session, or the conversation after `/clear`, offers the tasks the last one in this repository left open: **continue** puts them in the prompt box, **dismiss** forgets them. It turns on Claude's task tools for the session (`CLAUDE_CODE_ENABLE_TODO_TOOLS`), which Claude Code leaves off for Claude 5.x, unless you set that variable yourself; Claude may then keep a task list on screen (`Ctrl+T` hides it) |
| CJK escape guard | on | Refuses Korean, Chinese or Japanese written as `\uXXXX` escapes in prose files and prompts; in code, where an escape can be meant, reminds once |
| Encoding guard | on | Before an edit to an existing file (up to 1 MiB) that is not UTF-8 (Big5, Shift-JIS, GBK, EUC-KR, UTF-16), reminds once that Claude Code reads and writes files as UTF-8 and would rewrite its text as `�` ([#7134](https://github.com/anthropics/claude-code/issues/7134)); sent again, the edit goes through and the file is not checked again that session |
| Traditional Chinese guard | auto | While you write Traditional Chinese, reminds once before Simplified characters or zh-CN terms go into a file and names the zh-TW forms (`这→這`, `服務器→伺服器`); zh-CN files, files already in Simplified, terms the file already uses and Japanese lines are left alone |

A prompt Claude writes for another agent or tool draws as a card with a token estimate and a copy button.

### Safety nets

On by default and quiet until they matter.

| Feature | Default | What it does |
| --- | --- | --- |
| Watch background work | on | When a command Claude runs in the background writes nothing for ten minutes (`backgroundQuietMinutes`), a row above the prompt says so: **ask Claude** fills the prompt box with a request to check the task, **ignore** drops it. A hung command otherwise reports nothing until you ask |
| Python in UTF-8 | on | On Windows, sets `PYTHONUTF8=1` for the session, so the Python that Claude runs reads and writes UTF-8 instead of the system code page, where CJK text fails with `UnicodeEncodeError` or prints as `?`; nothing is set when you set the variable yourself, and nothing happens elsewhere |
| Tree guard | on | Refuses a recursive delete of the root, a drive, your home directory, or the session's directory or one above it, recursive deletes through links, and links to `node_modules`; reminds once before a force push to `main` or `master`, and before `git reset --hard`, `git checkout -- <paths>`, `git restore` or `git clean -f` throws away uncommitted work, naming the files; while agents run, refuses tree rewrites and `git add -A` in the main tree |
| Heredoc guard | on | Reminds once before a Bash heredoc with an unquoted delimiter (`<<EOF`) whose body the shell would change: `${x}`, `$(cmd)` and backticks expanded, `\\` turned into `\`; sent again, it runs |
| Model per agent | auto | An agent with no model gets haiku, sonnet, opus or fable picked from its task by a short Haiku call, with a toast naming it; `choose` asks Claude to name one instead. A Workflow script without models is reminded once to name one per `agent()`; with `choose` or a fixed model it is refused until it does |

### Optional

Off by default, for particular workflows. Turn them on in `/tessera setup`.

| Feature | Default | What it does |
| --- | --- | --- |
| Glossary guard | off | When the repository's `CLAUDE.md` has a table with **Use** and **Avoid** columns, reminds once before a write brings in an avoided wording and names the term to use; does nothing without such a table |
| Workflows quote you | off | A Workflow script must carry your own words, so its agents keep your standing instruction |
| Client feedback inbox | off | Pasted chat logs (`22:55 Name message`) become numbered items; a complaint like a fixed item is flagged as a likely regression |

## Commands

| Command | Does |
| --- | --- |
| `/tessera setup` | Switch features on and off |
| `/tessera peek <file>` | Preview Markdown, CSV, JSON, docx, xlsx or pptx in the terminal |
| `/tessera copy` · `copy code` · `copy prompt` | Copy the last reply, its last code block, or its prompt card |
| `/tessera inbox` · `inbox fixed 3 5` | List the feedback inbox, mark items fixed at the current commit |
| `/tessera theme <name>` | Switch theme |
| `/tessera demo` | Show every element tessera draws |

Type `/tessera ` and a letter for suggestions with descriptions.

## Terminals

| Terminal | Image previews | "original" opens in |
| --- | --- | --- |
| kitty, Ghostty | real pixels | system viewer |
| Windows Terminal, iTerm2, Apple Terminal, SSH | cell art | system viewer (`explorer`, `open`, `xdg-open`) |
| Orca | cell art | an Orca browser tab |
| VS Code, Cursor | cell art | a VS Code tab |
| inside tmux or screen | cell art | as above |
| WSL | cell art | Windows viewer through `\\wsl.localhost` |

If detection is wrong, set `imageMode` to `pixels` or `cells` in `/config`. Orca can draw kitty graphics but not yet the Unicode placeholders Claude Code uses ([stablyai/orca#23615](https://github.com/stablyai/orca/issues/23615)).

## Where it runs

A mod's hooks run in every kind of session that loads the plugin; what it draws appears only where Claude Code draws mods. [The table](https://code.claude.com/docs/en/plugins/mods/overview#where-mods-run) is Claude Code's; this is what it means for tessera:

| Where you run Claude Code | Guards, options, carry-over, background watch | Previews, themed replies, folded diffs, the bands above the prompt |
| --- | --- | --- |
| A terminal, including an editor's integrated terminal and the JetBrains plugin | yes | yes; this is where tessera is tested |
| The Code tab of the Desktop app | yes | the Desktop app draws them with its own elements; the copy buttons there are not tested |
| A WSL session in the Desktop app | no, plugins are not available there | no |
| The VS Code extension's chat panel | yes | no, nothing a mod draws appears there |
| `claude -p` and the Agent SDK | yes | no |
| Remote Control from claude.ai or the phone | yes, in the session on your machine | in the terminal on your machine |
| A cloud session | only when the plugin reaches that session | no |

## What it does on your machine

No network requests of its own: the one model call, a short Haiku classification per Agent call that names no model (`agentModel: auto`, the default), goes through your Claude Code session. It reads your Claude Code settings (the `language` setting and whether tessera's marketplace auto-updates), Claude Code's paste cache, Workflow scripts when one starts, files you `peek`, the repository's `CLAUDE.md` for a glossary table, a file Claude is about to write Simplified characters, zh-CN terms or avoided glossary wordings into, and the bytes of a file Claude is about to edit, to tell its encoding; it runs `git rev-parse`, on Windows a junction listing before a recursive delete, `git status`, `git diff` or `git clean -n` before a git command that discards changes, a clipboard read once per collapsed text paste, and your platform's viewer when you ask for an original; while a command Claude moved to the background runs, it reads the size of that command's output file once a minute; while carry-over is on it sets `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` for the session, and on Windows `PYTHONUTF8=1` while Python in UTF-8 is on, each unless you set it yourself, and writes nothing to your settings. Details in [SECURITY.md](SECURITY.md).

## FAQ

**Does it slow Claude Code down?** A feature that is off registers no hooks and no timers. Paste previews check the prompt box four times a second while on.

**Does it add tokens?** Little, and only where it says. Measured on Claude Code 2.1.294 against a first request of about 55,000 tokens:

| Feature | Adds | When |
| --- | --- | --- |
| Diagram hint (themed replies, `diagramHints`) | about 300 tokens | once per context, again after a compaction |
| Reply in my language | about 70–100 tokens | once per context, again when your language changes or Claude's last reply drifted |
| Guards | the refusal's reason, a short paragraph | only when a call is refused |
| Model per agent | one separate Haiku call with the agent's task (its first 2,000 characters) | each Agent call without a model; nothing in your conversation |
| Carry over tasks | no measurable change: Claude Code loads the task tools on demand | |
| Watch background work | nothing, until you press **ask Claude** and send the prompt it fills in | |
| Client feedback inbox | a note naming the filed items | when you paste a chat log |
| Themed replies, paste previews, fold long diffs | nothing: display only | |

Each one can be switched off in `/tessera setup` or `/config`.

**Why not just install prismantis and cc-mod-image-view?** You can, if you use macOS or Linux and a kitty-graphics terminal. tessera exists for everything else: Windows, CJK, terminals without image protocols, and long agent runs.

## Credits

Reply rendering is adapted from [prismantis](https://github.com/NahumLitvin/prismantis) by Nahum Litvin; the paste-cache lookup follows [cc-mod-image-view](https://github.com/GGGODLIN/cc-mod-image-view) by gggodlin, itself from [claude-image-view](https://github.com/jarrodwatts/claude-image-view) by Jarrod Watts; PNG and zip inflation use [fflate](https://github.com/101arrowz/fflate). All MIT; see [NOTICE](NOTICE).

## Contributing

Issues and pull requests are welcome in English or Chinese. Read [CONTRIBUTING.md](CONTRIBUTING.md) first; the [code of conduct](CODE_OF_CONDUCT.md) applies. Questions go to [Discussions](https://github.com/OG-Matcha/tessera/discussions) ([SUPPORT.md](SUPPORT.md)); every release is listed in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
