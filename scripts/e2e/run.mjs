// Live check of tessera in real Claude Code sessions: `node e2e/run.mjs [name ...]` from scripts/.
// Needs a signed-in `claude` with tessera installed from this working tree; it spends a few Haiku turns.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { canSetClipboard, session } from './drive.mjs'
import { scenarios } from './scenarios.mjs'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const only = process.argv.slice(2)
const picked = scenarios.filter(s => only.length === 0 || only.includes(s.name))
const results = []
const leftover = []

async function attempt(scenario) {
  const dir = mkdtempSync(join(tmpdir(), `tessera-e2e-${scenario.name}-`))
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir })
    scenario.setup?.(dir)
    const shots = {}
    for (const run of scenario.sessions(dir, repo)) Object.assign(shots, await session({ cwd: dir, ...run }))
    const failure = scenario.check(shots, dir)
    if (failure !== undefined) {
      mkdirSync(join(repo, 'scripts', 'e2e', 'last'), { recursive: true })
      writeFileSync(join(repo, 'scripts', 'e2e', 'last', `${scenario.name}.txt`), Object.entries(shots).map(([name, shot]) => `===== ${name}\n${typeof shot === 'string' ? shot : shot.text ?? ''}`).join('\n'))
    }
    return failure
  } catch (err) {
    return String(err)
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
    } catch {
      leftover.push(dir)
    }
  }
}

// A scenario that prompts the model gets a second try: Haiku does not always do what it is told, and a
// tool call it never made says nothing about tessera.
for (const scenario of picked) {
  if (scenario.clipboard && !canSetClipboard) {
    results.push([scenario.name, 'skip', 'clipboard is only scripted on Windows'])
  } else {
    const first = await attempt(scenario)
    const second = first !== undefined && scenario.prompts ? await attempt(scenario) : first
    results.push([scenario.name, second !== undefined ? 'FAIL' : first !== undefined ? 'pass (2nd try)' : 'pass', second ?? ''])
  }
  const [name, status] = results.at(-1)
  console.log(`${status.padEnd(4)} ${name}`)
}

// A killed session can hold its directory for a few seconds after the run moves on.
await new Promise(r => setTimeout(r, 5_000))
for (const dir of leftover) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 1_000 })
  } catch {
    console.log(`left behind, still in use: ${dir}`)
  }
}

const failed = results.filter(([, status]) => status === 'FAIL')
for (const [name, , detail] of failed) console.log(`\n--- ${name}\n${detail}`)
process.exit(failed.length > 0 ? 1 : 0)
