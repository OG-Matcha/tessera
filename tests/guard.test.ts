import { expect, test } from 'claude-code/testing'

import { commandDir, forcePushes, isDefaultBranch, misEscapedCjk, quotesUser, recursiveDeletes, scriptNamesModel, shellRisks } from '../hooks/guard'

test('commands that rewrite the shared tree are flagged', () => {
  for (const c of [
    'git checkout 723c3e4 -- packages',
    'git switch main',
    'git stash',
    'git stash push -m wip',
    'git reset --hard HEAD~1',
    'git restore src/a.ts',
    'git clean -fd',
    'cd "I:/repo" && git -C . stash',
  ])
    expect(shellRisks(c)).toContain('tree-rewrite')
})

test('read-only and narrow git calls pass', () => {
  for (const c of ['git status', 'git stash list', 'git log --oneline', 'git diff --stat', 'git add hooks/a.ts', 'git clean -n', 'echo git reset'])
    expect(shellRisks(c)).toEqual([])
})

test('staging everything is flagged', () => {
  expect(shellRisks('git add -A && git commit -m x')).toEqual(['stage-all'])
  expect(shellRisks('git add .')).toEqual(['stage-all'])
  expect(shellRisks('git commit -am "x"')).toEqual(['stage-all'])
})

test('linking node_modules is flagged in cmd, PowerShell and sh', () => {
  expect(shellRisks('mklink /J wt\\node_modules I:\\repo\\node_modules')).toEqual(['link-node-modules'])
  expect(shellRisks('New-Item -ItemType Junction -Path wt/node_modules -Target ../node_modules')).toEqual(['link-node-modules'])
  expect(shellRisks('ln -s ../repo/node_modules node_modules')).toEqual(['link-node-modules'])
  expect(shellRisks('New-Item -ItemType Junction -Path cache -Target D:/cache')).toEqual([])
})

test('the directory comes from a leading cd or git -C', () => {
  expect(commandDir('cd "I:/接案/repo" && git stash')).toBe('I:/接案/repo')
  expect(commandDir('Set-Location C:\\w; git reset')).toBe('C:\\w')
  expect(commandDir('git -C ../wt checkout main')).toBe('../wt')
  expect(commandDir('git reset')).toBe(undefined)
})

test('a script quotes the user when ten of their characters appear verbatim', () => {
  const prompts = ['好', '你先持續按照規格先幫我們把所有的內容先做起來']
  expect(quotesUser('const COMMON = `User, 2026-09-30: 「你先持續按照規格先幫我們把所有的內容先做起來」`', prompts)).toBe(true)
  expect(quotesUser('const COMMON = `Implement the spec.`', prompts)).toBe(false)
  expect(quotesUser('anything', ['繼續'])).toBe(false)
})

test('a script with agent() calls must name a model', () => {
  expect(scriptNamesModel("await agent('x', { label: 'a' })")).toBe(false)
  expect(scriptNamesModel("await agent('x', { model: 'opus' })")).toBe(true)
  expect(scriptNamesModel('return 1')).toBe(true)
})

test('cmd chains with a single & are split too', () => {
  expect(shellRisks('cd /d I:/repo & git stash')).toEqual(['tree-rewrite'])
  expect(shellRisks('npm test 2>&1 | tail')).toEqual([])
})

test('recursive deletes name their targets in sh, PowerShell, cmd and git', () => {
  expect(recursiveDeletes('rm -rf ../wt/a "b c"')).toEqual(['../wt/a', 'b c'])
  expect(recursiveDeletes('Remove-Item -Recurse -Force -Path C:/w/wt-a')).toEqual(['C:/w/wt-a'])
  expect(recursiveDeletes('Remove-Item C:/w/x -Recurse')).toEqual(['C:/w/x'])
  expect(recursiveDeletes('cmd /c rmdir /s /q I:/scratch/ab')).toEqual(['I:/scratch/ab'])
  expect(recursiveDeletes('rm -rf /tmp/wt-a')).toEqual(['/tmp/wt-a'])
  expect(recursiveDeletes('rmdir /s /q I:/scratch/ab')).toEqual(['I:/scratch/ab'])
  expect(recursiveDeletes('git worktree remove --force ../wt-a && echo ok')).toEqual(['../wt-a'])
})

test('plain deletes, globs and variables are not judged', () => {
  expect(recursiveDeletes('rm a.txt')).toEqual([])
  expect(recursiveDeletes('Remove-Item a.txt')).toEqual([])
  expect(recursiveDeletes('rm -rf $TMP/x dist/*')).toEqual([])
})

test('CJK written as \\u escapes in prompt-like parameters is caught', () => {
  expect(misEscapedCjk('AskUserQuestion', { questions: [{ question: '\\uD55C\\uAD6D\\uC5B4 OK?' }] })).toBe('\\uD55C')
  expect(misEscapedCjk('TodoWrite', { todos: [{ content: '\\u4fee\\u6b63 bug' }] })).toBe('\\u4fee')
  expect(misEscapedCjk('TodoWrite', { todos: [{ content: '修正 bug \\u0041' }] })).toBe(undefined)
})

test('in files, only prose or text that also holds literal CJK is judged', () => {
  expect(misEscapedCjk('Write', { file_path: 'docs/a.md', content: '\\uD55C\\uAD6D' })).toBe('\\uD55C')
  expect(misEscapedCjk('Edit', { file_path: 'src/a.ts', old_string: 'x', new_string: "label = '한국 \\uC5B4'" })).toBe('\\uC5B4')
  expect(misEscapedCjk('Write', { file_path: 'src/re.ts', content: 'const HAN = /[\\u4e00-\\u9fff]/' })).toBe(undefined)
  expect(misEscapedCjk('Bash', { command: 'echo \\u4e2d' })).toBe(undefined)
})

test('forced pushes name their destination, or the current branch when they name none', () => {
  expect(forcePushes('git push --force origin main')).toEqual(['main'])
  expect(forcePushes('git push -f origin HEAD:refs/heads/master')).toEqual(['refs/heads/master'])
  expect(forcePushes('git push origin +main')).toEqual(['main'])
  expect(forcePushes('git push --force-with-lease')).toEqual([undefined])
  expect(forcePushes('git push -uf origin HEAD')).toEqual([undefined])
  expect(forcePushes('npm test && git push --force origin feature/x')).toEqual(['feature/x'])
  expect(forcePushes('git push origin main')).toEqual([])
  expect(forcePushes('git push --follow-tags origin main')).toEqual([])
})

test('main and master are the default branches', () => {
  expect(['main', 'master', 'refs/heads/main'].every(isDefaultBranch)).toBe(true)
  expect(['mainline', 'feature/main', 'dev'].some(isDefaultBranch)).toBe(false)
})
