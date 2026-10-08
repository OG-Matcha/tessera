import { expect, test } from 'claude-code/testing'

import { expandedHeredoc } from '../hooks/guard'

test('an unquoted heredoc that would expand code is caught', () => {
  expect(expandedHeredoc('cat > a.sh <<EOF\nout=${name}\nEOF')).toBe('${')
  expect(expandedHeredoc('cat > a.js <<EOF\nconst re = /\\\\d+/\nEOF')).toBe('\\\\')
  expect(expandedHeredoc('python - <<PY\nprint($(whoami))\nPY')).toBe('$(')
})

test('quoted delimiters, plain variables and herestrings pass', () => {
  expect(expandedHeredoc("cat > a.ts <<'EOF'\nconst s = `${name}`\nEOF")).toBe(undefined)
  expect(expandedHeredoc('cat > a.ts <<"EOF"\nconst s = `${name}`\nEOF')).toBe(undefined)
  expect(expandedHeredoc('cat > notes.txt <<EOF\nhome is $HOME\nEOF')).toBe(undefined)
  expect(expandedHeredoc('grep x <<< "${name}"')).toBe(undefined)
})

test('only the heredoc body counts, up to its delimiter', () => {
  expect(expandedHeredoc('cat > a.txt <<EOF\nplain\nEOF\necho "${done}"')).toBe(undefined)
  expect(expandedHeredoc('cat > a.txt <<-EOF\n\tplain\n\tEOF\necho `date`')).toBe(undefined)
})
