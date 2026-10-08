# Contributing

Bug reports, fixes and ideas are welcome, in English or Chinese. Open an issue before a large change so we can agree on the shape first.

## What tessera takes on

A feature belongs here when it changes an outcome for the person at the terminal: it prevents a loss, saves time or tokens, or makes something visible that Claude Code hides. Features that only display numbers already shown elsewhere (Claude Code's tasks list, `/workflows`, the status line) do not.

New features ship behind an option in `.claude-plugin/plugin.json`, listed in `hooks/features.ts` so `/tessera setup` can switch them. A feature that is off registers no hooks and no timers.

## Layout

| Path | What |
| --- | --- |
| `hooks/register.tsx` | Every hook and every function that touches `$` (the engine requires them in the hooks module itself) |
| `hooks/*.ts` | Pure logic, tested without the engine: `guard`, `platform`, `voice`, `inbox`, `peek`, `png`, `raster`, ... |
| `hooks/markdown.ts`, `render.tsx`, `theme.ts`, `presets.ts`, `mermaid.tsx`, `rtl.ts`, `help.ts` | Reply rendering, adapted from [prismantis](https://github.com/NahumLitvin/prismantis) |
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

## Rules

- No runtime dependencies. Anything bundled into `hooks/vendor/` must be MIT and listed in `NOTICE`.
- Code, identifiers and comments in English. A comment says why, or records a fact the code cannot show; it does not restate the code.
- Every user-facing string goes through `hooks/i18n.ts` in English and Traditional Chinese.
- Every change comes with a test. Anything visual also needs a screenshot in the PR, with the terminal named.
- Add a line under `## [Unreleased]` in `CHANGELOG.md`.

## Releases

Versions follow [Semantic Versioning](https://semver.org/). Before 1.0, a release with new features or changed options bumps the minor version (0.2.0) and a release with fixes only bumps the patch (0.1.2). Changes collect under `## [Unreleased]` and ship together: a release is cut when a set of features is done, or sooner for a fix that blocks people. Installs follow the `version` in `plugin.json`, so commits between releases reach no one.

Bump the version in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, turn `[Unreleased]` into the new version in `CHANGELOG.md`, then push a `vX.Y.Z` tag. The release workflow checks the versions agree and publishes the notes.
