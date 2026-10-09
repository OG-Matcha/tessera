# Contributing

Bug reports, fixes and ideas are welcome, in English or Chinese. Open an issue before a large change so we can agree on the shape first.

## What tessera takes on

A feature belongs here when it changes an outcome for the person at the terminal: it prevents a loss, saves time or tokens, or makes something visible that Claude Code hides. Features that only display numbers already shown elsewhere (Claude Code's tasks list, `/workflows`, the status line) do not.

New features ship behind an option in `.claude-plugin/plugin.json`, listed in `hooks/features.ts` so `/tessera setup` can switch them. A feature that is off registers no hooks and no timers.

## Layout

| Path | What |
| --- | --- |
| `hooks/register.tsx` | The hooks module: settles the session and registers each feature's hooks |
| `hooks/*-hooks.ts` | A feature's hooks and the functions that touch `$`: `guard-hooks`, `paste-hooks`. The engine follows `$` only into functions of the same file, so a module's hooks are registered in it (`registerX(on, options)`) and `$` never crosses an import. A plugin has one `session.start` without a matcher, in `register.tsx`; a module needing one adds a matcher |
| `hooks/session.ts` | What the session settles (language, the person's voice, the environment), read by every feature module |
| `hooks/*.ts` | Pure logic, tested without the engine: `guard`, `hans`, `glossary`, `carry`, `fold`, `update`, `platform`, `voice`, `inbox`, `peek`, `paste`, `limits`, `complete`, `features`, `i18n`, `png`, `raster` |
| `hooks/markdown.ts`, `render.tsx`, `theme.ts`, `presets.ts`, `mermaid.tsx`, `rtl.ts`, `help.ts`, `help-zh.ts` | Reply rendering, adapted from [prismantis](https://github.com/NahumLitvin/prismantis) |
| `hooks/vendor/` | Generated; rebuild with the command in `.github/workflows/ci.yml`, never edit by hand |
| `types/index.d.ts` | The `$.state` contract |
| `tests/` | `claude plugin test` suites |

## Develop

```sh
claude plugin validate .
claude plugin test .
npx -p typescript@5 tsc -p .
```

`tsc` needs the API types in `.claude-plugin/types/`, which appear after `claude --plugin-dir .` runs once.

To try a change live, disable the installed copy first (`claude plugin disable tessera@tessera`), then load the working tree with `claude --plugin-dir .`. Two copies at once draw the same components twice.

### Live check

`claude plugin test` feeds hooks simulated events, and a simulated event can differ from what Claude Code sends: the collapsed-paste preview passed its tests for two releases while it never fired. `scripts/e2e` drives real sessions in a pseudo-terminal, each in a throwaway repository, and reads the screen:

```sh
cd scripts
npm ci
node e2e/run.mjs                 # every scenario
node e2e/run.mjs paste-text      # one by name
```

It needs a signed-in `claude` with tessera installed from this working tree, spends a few Haiku turns, and replaces your clipboard. Clipboard scenarios run on Windows only. Run it before a release, and add a scenario with any feature that depends on what Claude Code sends. Screens of failed scenarios land in `scripts/e2e/last/`; `E2E_KEEP=1` keeps every screen, which is how a UI change is compared before and after. Sessions share your Claude Code config, so tessera may draw them in the language you last wrote in: match both languages in checks. A fullscreen launch killed before it reports healthy counts against fullscreen for the whole machine, and two turn it off in your own sessions too (`fullscreenAutoDisabled` in `~/.claude.json`; `/tui fullscreen` turns it back on): let every session you script run a few seconds past its first prompt. The driver sets `CLAUDE_CODE_NO_FLICKER=1` so its sessions stay in fullscreen, where buttons take clicks.

## Rules

- No runtime dependencies. Anything bundled into `hooks/vendor/` must be MIT and listed in `NOTICE`.
- Code, identifiers and comments in English. A comment says why, or records a fact the code cannot show; it does not restate the code.
- Every user-facing string goes through `hooks/i18n.ts` in English and Traditional Chinese.
- Every change comes with a test. Anything visual also needs a screenshot in the PR, with the terminal named.
- Add a line under `## [Unreleased]` in `CHANGELOG.md`.

## Releases

Versions follow [Semantic Versioning](https://semver.org/). Before 1.0, a release with new features or changed options bumps the minor version (0.2.0) and a release with fixes only bumps the patch (0.1.2). Changes collect under `## [Unreleased]` and ship together: a release is cut when a set of features is done, or sooner for a fix that blocks people. Existing installs update only when the `version` in `plugin.json` changes, but a new install takes whatever is on `master`, so `master` must always be releasable.

`node scripts/check-sync.mjs` runs in CI and fails when a feature lacks its option or README rows, a hooks module is missing from the layout above, or the marketplace entry or GitHub description differs from `plugin.json`. Before a release, also check by hand what it cannot:

- `node e2e/run.mjs` passes in `scripts/`.
- Both READMEs describe current behavior, commands and footprint; `SECURITY.md` lists every file read and process run.
- `docs/demo.gif`, `docs/banner.svg`, the social preview and `/tessera demo` in both languages (`hooks/help.ts`, `hooks/help-zh.ts`) show nothing removed.
- The GitHub topics still fit.
- The token table in both READMEs still holds: re-measure with the `cost-*` scenarios in `scripts/e2e/scenarios.mjs` when a feature adds to the context.

Bump the version in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, turn `[Unreleased]` into the new version in `CHANGELOG.md`, then push a `vX.Y.Z` tag. The release workflow checks the versions agree and publishes the notes.
