import { expect, test } from 'claude-code/testing'

import { parse } from '../hooks/markdown'
import { wrapRanges } from '../hooks/render'

// A streamed Chinese reply is wrapped again on every delta, so wrapping must stay cheap: a paragraph of
// 2,880 characters once took 300-600 ms because every candidate line was re-measured from its start.
const paragraph = '網頁快取是瀏覽器或中間節點把先前取得的回應存起來，之後相同的請求就直接用存起來的副本回答，不必再問原始伺服器。'.repeat(60)

test('wrapping a long Chinese paragraph takes milliseconds, not hundreds', () => {
  const [block] = parse(paragraph, { numbers: false, paths: false })
  expect(block?.kind).toBe('paragraph')
  const started = performance.now()
  const lines = wrapRanges(paragraph, 76)
  const took = performance.now() - started
  expect(lines.length).toBeGreaterThan(70)
  expect(took).toBeLessThan(100)
})
