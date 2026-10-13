// Two masks. `veil`: a tool result's secrets (keys, tokens, passwords) as ••••, before Claude reads it
// and before it goes into the transcript. `mask`: record mode, the text tessera draws with the strings that
// identify an account or a person masked too (emails, phone numbers), for a screen that is being recorded,
// streamed or shared; on screen only.

const DOTS = '••••••••'

// A key by its issuer's prefix, with the prefix kept so the viewer can still tell which service it was.
const KEYS: [prefix: string, body: string][] = [
  ['sk-ant-[a-z0-9]+-', '[A-Za-z0-9_-]{20,}'],
  ['sk-(?:proj|svcacct|admin)-', '[A-Za-z0-9_-]{20,}'],
  ['sk-', '[A-Za-z0-9_-]{20,}'],
  ['(?:sk|pk|rk)_(?:live|test)_', '[A-Za-z0-9]{10,}'],
  ['whsec_', '[A-Za-z0-9]{10,}'],
  ['gh[pousr]_', '[A-Za-z0-9]{20,}'],
  ['github_pat_', '[A-Za-z0-9_]{20,}'],
  ['glpat-', '[A-Za-z0-9_-]{16,}'],
  ['xox[abpsr]-', '[A-Za-z0-9-]{10,}'],
  ['xapp-', '[A-Za-z0-9-]{10,}'],
  ['(?:AKIA|ASIA)', '[0-9A-Z]{16}'],
  ['AIza', '[0-9A-Za-z_-]{35}'],
  ['ya29\\.', '[0-9A-Za-z_.-]{20,}'],
  ['npm_', '[A-Za-z0-9]{20,}'],
  ['pypi-', '[A-Za-z0-9_-]{20,}'],
  ['hf_', '[A-Za-z0-9]{20,}'],
  ['r8_', '[A-Za-z0-9]{20,}'],
  ['xai-', '[A-Za-z0-9]{20,}'],
  ['SG\\.', '[A-Za-z0-9_-]{16,}\\.[A-Za-z0-9_-]{16,}'],
  ['dop_v1_', '[a-f0-9]{20,}'],
  ['lin_api_', '[A-Za-z0-9]{20,}'],
  ['figd_', '[A-Za-z0-9_-]{20,}'],
  ['shp(?:at|ss|ca|pa)_', '[a-f0-9]{20,}'],
  ['eyJ', '[A-Za-z0-9_-]{8,}\\.eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}'],
]
const KEY = new RegExp(`(?<![A-Za-z0-9_-])(?:${KEYS.map(([prefix, body]) => `(${prefix})${body}`).join('|')})(?![A-Za-z0-9_-])`, 'g')

const PRIVATE_KEY = /(-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----)/g
const BEARER = /\b((?:Bearer|Basic|Token)\s+)[A-Za-z0-9_.~+/=-]{16,}/gi
// The password in a URL (postgres://app:s3cret@db): the user stays, as it names an account, not a secret.
const URL_PASSWORD = /(:\/\/[^\s/:@]+:)[^\s@/]+(@)/g
// A value given to a name that says it is a secret (API_KEY=…, "password": "…", ?token=…): eight or more
// characters, with a digit or sixteen long, so a word (`password: required`) or a placeholder stays.
const ASSIGNMENT = /(\b[\w-]*?(?:key|token|secret|password|passwd|pwd)s?\b["']?\s*[=:]\s*["']?)([^\s"'`,;)}\]]{8,})/gi
const EMAIL = /(?<![\w.+-])([\w.+-])[\w.+-]*@(?:[\w-]+\.)+([a-z]{2,})(?![\w-])/gi
// A phone number: a country code, an area code in parentheses or a leading zero, then two groups of three
// or four digits, joined by at most a space or a hyphen each. Dates, versions, ports and times never start
// so, and a plain count has no leading zero. A full stop after it ends a sentence, not a version.
const PHONE = /(?<![\w-]|\d\.)(?:(?:\+\d{1,3}[ -]?\d{2,4}[ -]?|\(\d{2,4}\)[ -]?|0\d{1,3}[ -]?)\d{3,4}[ -]?\d{3,4}|\d{3}[-.]\d{3}[-.]\d{4})(?![\w-]|\.\d)/g

// A key masked above keeps its prefix, so an assignment of one is left as it is.
const secretValue = (value: string) => !value.includes(DOTS) && (/\d/.test(value) || value.length >= 16)
// What Claude reads must keep its code: an expression (`process.env.API_KEY`, `${TOKEN}`, `getenv("x")`),
// a dotted or constant name, or a placeholder (`your_api_key_here`) given to a secret-sounding name is no
// secret, and masked it would break the edit or the answer that follows.
const CODE = /[(){}$<>[\]]|^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$|^[A-Z][A-Z0-9_]*$/
const PLACEHOLDER = /your|example|placeholder|change[_-]?me|xxxx|dummy|sample/i
const secretForModel = (value: string) => secretValue(value) && !CODE.test(value) && !PLACEHOLDER.test(value)

// The secrets masked, with how many.
const secrets = (text: string, isSecret: (value: string) => boolean): [text: string, count: number] => {
  let count = 0
  const hit = (replacement: string) => {
    count++
    return replacement
  }
  const masked = text
    .replace(PRIVATE_KEY, (_, begin: string, end: string) => hit(`${begin}\n${DOTS}\n${end}`))
    .replace(KEY, (_, ...groups: unknown[]) => hit(`${groups.slice(0, KEYS.length).find(g => typeof g === 'string') as string}${DOTS}`))
    .replace(BEARER, (_, head: string) => hit(`${head}${DOTS}`))
    .replace(URL_PASSWORD, (_, head: string, at: string) => hit(`${head}${DOTS}${at}`))
    .replace(ASSIGNMENT, (whole: string, head: string, value: string) => (isSecret(value) ? hit(`${head}${DOTS}`) : whole))
  return [masked, count]
}

export const mask = (text: string): string =>
  secrets(text, secretValue)[0]
    .replace(EMAIL, (whole: string, first: string, tld: string) => (whole.startsWith('git@') ? whole : `${first}•••@•••.${tld}`))
    .replace(PHONE, number => number.slice(0, 4) + number.slice(4).replace(/\d/g, '•'))

export const veil = (text: string): [text: string, count: number] => secrets(text, secretForModel)

// A string past this is a file's bytes (an image, a PDF), never text with a key in it.
const VEIL_MAX = 1_000_000

// A tool's result with every string in it veiled, however deep: a shell's stdout, a file's content, an MCP
// tool's content blocks. The same object comes back when nothing was masked.
export const veilValues = (value: unknown): [value: unknown, count: number] => {
  if (typeof value === 'string') return value.length > VEIL_MAX ? [value, 0] : veil(value)
  if (Array.isArray(value)) {
    let count = 0
    const out = value.map(v => {
      const [veiled, n] = veilValues(v)
      count += n
      return veiled
    })
    return [count === 0 ? value : out, count]
  }
  if (value !== null && typeof value === 'object') {
    let count = 0
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const [veiled, n] = veilValues(v)
      count += n
      out[k] = veiled
    }
    return [count === 0 ? value : out, count]
  }
  return [value, 0]
}

// A tool call's input or output with its strings masked, one level deep: a command, a path, a pattern, a
// shell result's stdout and stderr.
export const maskValues = <T>(value: T): T => {
  if (typeof value === 'string') return mask(value) as T
  if (Array.isArray(value)) return value.map(v => (typeof v === 'string' ? mask(v) : v)) as T
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeof v === 'string' ? mask(v) : v])) as T
  return value
}
