import { expect, test } from 'claude-code/testing'

import { completions } from '../hooks/complete'
import { helpText } from '../hooks/help'
import { helpTextZh } from '../hooks/help-zh'

test('the help in both languages lists every subcommand the typeahead offers', () => {
  for (const [lang, help] of [['en', helpText([])], ['zh-TW', helpTextZh([])]] as const) {
    const subs = completions('/tessera ', 9, '', [], lang).map(row => row.text)
    expect(subs.length > 0).toBe(true)
    for (const sub of subs) expect(help).toContain(`/tessera ${sub}`)
  }
})
