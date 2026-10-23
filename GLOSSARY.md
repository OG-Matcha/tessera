# tessera

tessera is a Claude Code mod that shows what Claude Code hides and stops mistakes that lose work. This glossary fixes the words its features and docs use.

## Language

**Prompt**（輸入）:
A message the person submitted to the current session, typed or pasted, including slash commands and messages sent remotely. Text that Claude, hooks or tools add is not a Prompt.
_Avoid_: input (that is a tool call's arguments here), question, 提問, 問題, user message

**Prompt Log**（輸入紀錄）:
The session's Prompts in the order they were sent, which the person opens with `/tessera log` to find one and go back to it.
_Avoid_: input log, history, 提問紀錄
