import { expect, test } from 'claude-code/testing'

import { commandDir, dataResets, discards, expandedHeredoc, forcePushes, hostPath, isDefaultBranch, misEscapedCjk, quotesUser, recursiveDeletes, resolvePath, rootLike, scriptNamesModel, shellRisks } from '../hooks/guard'

test('one place spelled two ways resolves to one path', () => {
  expect(resolvePath('I:/w/pkg/sub', '../.git')).toBe('i:/w/pkg/.git')
  expect(resolvePath('I:/w/pkg/sub', 'I:/w/pkg/.git')).toBe('i:/w/pkg/.git')
  expect(resolvePath('C:\\w\\pkg', '.git')).toBe('c:/w/pkg/.git')
  expect(resolvePath('/w/pkg', './.git')).toBe('/w/pkg/.git')
  expect(resolvePath('/w/pkg', '/w/pkg/.git/worktrees/a')).not.toBe(resolvePath('/w/pkg', '/w/pkg/.git'))
})

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
  expect(commandDir('git -c core.quotepath=false stash')).toBe(undefined)
  expect(commandDir('git reset')).toBe(undefined)
})

test('git options before the verb do not hide it', () => {
  expect(shellRisks('git -c core.quotepath=false stash')).toEqual(['tree-rewrite'])
  expect(shellRisks('git --no-pager -C wt reset --hard')).toEqual(['tree-rewrite'])
  expect(discards('git -c user.name=me reset --hard')).toEqual([{ verb: 'reset', args: [] }])
})

test('a heredoc body is data, not commands', () => {
  const commit = "git commit -F - <<'EOF'\nfix: stop the reset\n\nBefore, `git reset --hard && git clean -fd` ran.\nEOF\ngit push"
  expect(shellRisks(commit)).toEqual([])
  expect(discards(commit)).toEqual([])
  expect(shellRisks("cat > a.txt <<EOF\nplain\nEOF\ngit stash")).toEqual(['tree-rewrite'])
  // Commands after a body are still commands: a << in the body, several heredocs, CRLF.
  expect(forcePushes("git commit -F - <<'EOF'\nUse << operator\nEOF\ngit push -f origin main")).toEqual(['main'])
  expect(forcePushes('cat <<A <<B\na\nA\nb\nB\ngit push -f origin main')).toEqual(['main'])
  expect(forcePushes('cat <<EOF\r\nx\r\nEOF\r\ngit push -f origin main')).toEqual(['main'])
  // With no end line it is not a heredoc (a << in a message), so what follows is commands.
  expect(shellRisks('cat <<EOF\ngit stash')).toEqual(['tree-rewrite'])
  // A shift and a herestring are not heredocs.
  expect(forcePushes('echo $((1<<n))\ngit push --force origin main')).toEqual(['main'])
  expect(recursiveDeletes('echo $((1<<n))\nrm -rf foo')).toEqual(['foo'])
  expect(shellRisks('cat <<<EOF\ngit reset --hard\nEOF')).toEqual(['tree-rewrite'])
  // A body a local shell reads is commands.
  expect(shellRisks("bash <<'EOF'\ngit reset --hard\nEOF")).toEqual(['tree-rewrite'])
  expect(expandedHeredoc('cat > a <<EOF\r\n${x}\r\nEOF\r\n')).toBe('${')
})

test('only commit -a or --all stages everything', () => {
  expect(shellRisks('git commit -am "wip"')).toEqual(['stage-all'])
  expect(shellRisks('git commit -am"wip"')).toEqual(['stage-all'])
  expect(shellRisks('git commit -amwip')).toEqual(['stage-all'])
  expect(shellRisks('git commit --all -m x')).toEqual(['stage-all'])
  expect(shellRisks('git commit -m "add a test"')).toEqual([])
  expect(shellRisks('git commit --amend --no-edit')).toEqual([])
})

test('any git option before the verb is skipped, and -C is found behind them', () => {
  for (const c of ['git --no-optional-locks reset --hard', 'git --git-dir .git reset --hard', 'git -P reset --hard', 'git --work-tree=../wt -c a=b stash']) expect(shellRisks(c)).toEqual(['tree-rewrite'])
  expect(commandDir('git --no-pager -C wt reset --hard')).toBe('wt')
  expect(commandDir('git -c a=b -C wt stash')).toBe('wt')
})

test('a delete of a root, a drive, home, or the working directory or above has no good reading', () => {
  expect(rootLike('/', '/w/repo', '/home/u')).toBe(true)
  expect(rootLike('C:/', 'C:/w/repo', 'C:/Users/u')).toBe(true)
  expect(rootLike('c:', 'C:/w/repo', 'C:/Users/u')).toBe(true)
  expect(rootLike('C:/Users/u', 'C:/w/repo', 'C:/Users/u')).toBe(true)
  expect(rootLike('C:/w/repo', 'C:/w/repo', 'C:/Users/u')).toBe(true)
  expect(rootLike('C:/w', 'C:/w/repo', 'C:/Users/u')).toBe(true)
  expect(rootLike('C:/w/repo/dist', 'C:/w/repo', 'C:/Users/u')).toBe(false)
  expect(rootLike('C:/w/other', 'C:/w/repo', 'C:/Users/u')).toBe(false)
  expect(rootLike('/w/repo/../repo', '/w/repo', undefined)).toBe(true)
  expect(recursiveDeletes('rm -rf $HOME/.cache')).toEqual(['~/.cache'])
  expect(recursiveDeletes('Remove-Item -Recurse $env:USERPROFILE\\tmp')).toEqual(['~\\tmp'])
  expect(recursiveDeletes('rm -rf $OTHER/x')).toEqual([])
})

test('commands that throw a database away are named, and look-alikes are not', () => {
  expect(dataResets('npx prisma migrate reset --force')).toEqual(['prisma migrate reset'])
  expect(dataResets('pnpm exec prisma db push --force-reset')).toEqual(['prisma migrate reset'])
  expect(dataResets('supabase db reset && bin/rails db:drop')).toEqual(['supabase db reset', 'rails db:drop'])
  expect(dataResets('php artisan migrate:fresh --seed')).toEqual(['artisan migrate:fresh'])
  expect(dataResets('docker compose -f dev.yml down -v')).toEqual(['docker compose down -v'])
  expect(dataResets('docker-compose down --volumes --remove-orphans')).toEqual(['docker compose down -v'])
  expect(dataResets('docker volume prune -f; dropdb app_dev')).toEqual(['docker volume rm', 'dropdb'])
  for (const c of ['prisma migrate dev', 'prisma db push', 'rails db:migrate', 'docker compose down', 'docker system prune', 'docker volume ls', "git commit -F - <<'EOF'\nrun docker compose down -v later\nEOF"]) expect(dataResets(c)).toEqual([])
})

test('Git Bash paths on Windows are the file system’s', () => {
  expect(hostPath('/c/w/x', '/home/u', true)).toBe('C:/w/x')
  expect(hostPath('/c', undefined, true)).toBe('C:/')
  expect(hostPath('~/w', 'C:/Users/u', true)).toBe('C:/Users/u/w')
  expect(hostPath('~/w', '/home/u', false)).toBe('/home/u/w')
  expect(hostPath('/c/w', undefined, false)).toBe('/c/w')
  expect(hostPath('/usr/bin', undefined, true)).toBe('/usr/bin')
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
  expect(recursiveDeletes('rm -rf $TMP/x dist/*')).toEqual(['dist'])
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

test('deletes of a Git Bash drive, joined cmd switches, a quoted cmd /c command, a sudo prefix and a trailing /* are seen', () => {
  expect(recursiveDeletes('rm -rf /c')).toEqual(['/c'])
  expect(recursiveDeletes('rmdir /s/q C:\\')).toEqual(['C:\\'])
  expect(recursiveDeletes('cmd /c "rd /s /q C:\\w\\x"')).toEqual(['C:\\w\\x'])
  expect(recursiveDeletes('cmd //c rd /s /q C:\\w\\x')).toEqual(['C:\\w\\x'])
  expect(recursiveDeletes('sudo rm -rf /')).toEqual(['/'])
  expect(recursiveDeletes('FOO=1 sudo -n rm -rf /var/x')).toEqual(['/var/x'])
  expect(recursiveDeletes('rm -rf ~/*')).toEqual(['~'])
  expect(recursiveDeletes('rm -rf /*')).toEqual(['/'])
  expect(recursiveDeletes('rm -rf ./*')).toEqual(['.'])
  expect(recursiveDeletes('rm -rf dist/*')).toEqual(['dist'])
  expect(dataResets('sudo docker volume prune -f')).toEqual(['docker volume rm'])
  expect(dataResets('./bin/rails db:drop')).toEqual(['rails db:drop'])
})

test('on Windows a root, home or working directory spelled in another case is still itself', () => {
  expect(rootLike('c:/users/U/PROJ', 'C:/Users/u/proj', 'C:/Users/u', true)).toBe(true)
  expect(rootLike('c:\\USERS\\U', 'C:/Users/u/proj', 'C:/Users/u', true)).toBe(true)
  expect(rootLike('C:/Users/U', 'C:/Users/u/proj', 'C:/Users/u', false)).toBe(false)
})

test('a << in a message is not a heredoc, so the lines after it are judged; a shell fed by sudo or a path reads its body', () => {
  expect(forcePushes('git commit -m "see << note"\ngit push -f origin main')).toEqual(['main'])
  expect(dataResets('echo "a <<b"\ndocker volume prune')).toEqual(['docker volume rm'])
  expect(forcePushes("sudo bash <<'EOF'\ngit push -f origin main\nEOF")).toEqual(['main'])
  expect(forcePushes("/bin/sh <<'EOF'\ngit push -f origin main\nEOF")).toEqual(['main'])
  expect(forcePushes("pwsh -Command - <<'EOF'\ngit push -f origin main\nEOF")).toEqual(['main'])
  expect(forcePushes("git commit -F - <<'EOF'\ngit push -f origin main\nEOF")).toEqual([])
})

test('an Agent prompt written with CJK escapes is caught', () => {
  expect(misEscapedCjk('Agent', { prompt: '\\u4fee\\u6b63 bug', description: 'fix' })).toBe('\\u4fee')
})

test('a discard of a quoted path with a space is seen, a bare lower-case drive is a root, and more home spellings are home', () => {
  expect(discards('git checkout -- "my file.ts" src/b.ts')).toEqual([{ verb: 'checkout', args: ['my file.ts', 'src/b.ts'] }])
  expect(discards("git restore 'a b.ts'")).toEqual([{ verb: 'restore', args: ['a b.ts'] }])
  expect(hostPath('d:', undefined, true)).toBe('d:/')
  expect(rootLike(hostPath('d:', undefined, true), 'C:/w', 'C:/Users/u', true)).toBe(true)
  expect(recursiveDeletes('Remove-Item -Recurse ${env:USERPROFILE}\\x')).toEqual(['~\\x'])
  expect(recursiveDeletes('rmdir /s /q %HOMEDRIVE%%HOMEPATH%')).toEqual(['~'])
})
