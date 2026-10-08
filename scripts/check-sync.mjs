// Fails when a place that describes tessera has fallen behind the code: every switchable feature has an
// option and a row in both READMEs, every hooks module is in the CONTRIBUTING layout, and the marketplace
// entry and the GitHub repository say what plugin.json says.
import { readFileSync, readdirSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const problems = []

const plugin = JSON.parse(read('.claude-plugin/plugin.json'))
const marketplace = JSON.parse(read('.claude-plugin/marketplace.json'))
const features = read('hooks/features.ts')
const readme = read('README.md')
const readmeZh = read('README.zh-TW.md')
const contributing = read('CONTRIBUTING.md')

const keys = [...features.matchAll(/(?:flag\('|key: ')(\w+)'/g)].map(m => m[1])
const names = [...features.matchAll(/name: \{ en: '([^']+)', 'zh-TW': '([^']+)' \}|flag\('\w+', \w+, \{ en: '([^']+)', 'zh-TW': '([^']+)' \}/g)].map(m => [m[1] ?? m[3], m[2] ?? m[4]])
for (const key of keys) if (!(key in plugin.userConfig)) problems.push(`features.ts lists ${key}, which plugin.json has no option for`)
for (const [en, zh] of names) {
  if (!readme.includes(`| ${en} |`)) problems.push(`README.md has no feature row for "${en}"`)
  if (!readmeZh.includes(`| ${zh} |`)) problems.push(`README.zh-TW.md has no feature row for "${zh}"`)
}

const modules = readdirSync(new URL('../hooks', import.meta.url)).filter(f => /\.tsx?$/.test(f) && !f.endsWith('.d.ts') && f !== 'register.tsx')
for (const file of modules) if (!contributing.includes(`\`${file.replace(/\.tsx?$/, '')}\``) && !contributing.includes(`\`hooks/${file}\``) && !contributing.includes(`\`${file}\``)) problems.push(`CONTRIBUTING.md layout does not mention hooks/${file}`)

const entry = marketplace.plugins.find(p => p.name === plugin.name)
if (entry?.description !== plugin.description) problems.push('marketplace.json and plugin.json descriptions differ')

if (process.env.GITHUB_REPOSITORY) {
  const headers = process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}
  const repo = await (await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}`, { headers })).json()
  if (repo.description !== plugin.description) problems.push(`the GitHub description differs from plugin.json; run: gh repo edit --description "${plugin.description}"`)
}

for (const p of problems) console.error(`out of sync: ${p}`)
process.exit(problems.length > 0 ? 1 : 0)
