import { expect, test } from 'claude-code/testing'

import { mask, maskValues } from '../hooks/mask'

// Secret-shaped fixtures are assembled here, so no scanner takes the test for a leak.
const KEY = ['sk-ant-api03', 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'].join('-')
const GITHUB = ['ghp', 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'].join('_')
const AWS = ['AKIA', 'IOSFODNN7EXAMPLE'].join('')
const GOOGLE = ['AIza', 'SyA1234567890abcdefghijklmnopqrstuv'].join('')
const JWT = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0In0', 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'].join('.')
const BEARER = ['Bearer', 'abcdefghijklmnopqrstuvwxyz'].join(' ')
const PEM = (part: string) => `-----${part} RSA PRIVATE KEY-----`

test('keys keep their issuer prefix and lose the rest', () => {
  expect(mask(`ANTHROPIC_API_KEY=${KEY}`)).toBe('ANTHROPIC_API_KEY=sk-ant-api03-••••••••')
  expect(mask(`token ${GITHUB} here`)).toBe('token ghp_•••••••• here')
  expect(mask(`${AWS} and ${GOOGLE}`)).toBe('AKIA•••••••• and AIza••••••••')
  expect(mask(JWT)).toBe('eyJ••••••••')
  expect(mask(`Authorization: ${BEARER}`)).toBe('Authorization: Bearer ••••••••')
  expect(mask(['postgres://app:', 's3cret-pass', '@db.internal:5432/app'].join(''))).toBe('postgres://app:••••••••@db.internal:5432/app')
  expect(mask(`${PEM('BEGIN')}\nMIIEow\nAAAA\n${PEM('END')}`)).toBe(`${PEM('BEGIN')}\n••••••••\n${PEM('END')}`)
})

test('a value given to a secret-sounding name is masked when it looks like a secret', () => {
  expect(mask(['DB_PASSWORD=', 'hunter22hunter'].join(''))).toBe('DB_PASSWORD=••••••••')
  expect(mask(['"password": "', 'correcthorsebatterystaple', '"'].join(''))).toBe('"password": "••••••••"')
  expect(mask(['https://api.example.test/v1?access_token=', 'abc123def456'].join(''))).toBe('https://api.example.test/v1?access_token=••••••••')
  expect(mask('password: required')).toBe('password: required')
  expect(mask('token: ${GITHUB_TOKEN}')).toBe('token: ${GITHUB_TOKEN}')
  expect(mask('| Key | Value |')).toBe('| Key | Value |')
})

test('emails keep their first letter and top-level domain, git@ stays', () => {
  expect(mask('mail ada.lovelace+dev@example.com or bob@mail.example.co.uk')).toBe('mail a•••@•••.com or b•••@•••.uk')
  expect(mask('git clone git@github.com:OG-Matcha/tessera.git')).toBe('git clone git@github.com:OG-Matcha/tessera.git')
  expect(mask('@types/node and @Override and user@host')).toBe('@types/node and @Override and user@host')
})

test('phone numbers keep their first four characters; dates, versions, times and counts do not count', () => {
  expect(mask('call 0912-345-678 or +886 912 345 678 or (02) 2345-6789 or 555-123-4567')).toBe('call 0912-•••-••• or +886 ••• ••• ••• or (02) ••••-•••• or 555-•••-••••')
  expect(mask('0912345678')).toBe('0912••••••')
  expect(mask('call 0912-345-678.')).toBe('call 0912-•••-•••.')
  for (const plain of ['2026-10-11', '10.0.26300', '09:30', '0.0.0.0:8080', '100 200 300', '0123456789abcdef', '1234']) expect(mask(plain)).toBe(plain)
})

test('masked text is left as it is when masked again, and a tool input is masked one level deep', () => {
  const once = mask(`ada@example.com ${KEY}`)
  expect(mask(once)).toBe(once)
  expect(maskValues({ command: `curl -H "Authorization: ${BEARER}" https://x.test`, timeout: 5, nested: { a: 'ada@example.com' } })).toEqual({
    command: 'curl -H "Authorization: Bearer ••••••••" https://x.test',
    timeout: 5,
    nested: { a: 'ada@example.com' },
  })
  expect(maskValues(['ada@example.com', 3])).toEqual(['a•••@•••.com', 3])
  expect(maskValues(undefined)).toBe(undefined)
})
