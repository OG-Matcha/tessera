import type { Lang } from './i18n'
import { STRINGS } from './i18n'
import type { Env } from './platform'
import type { Voice } from './voice'

// What the session settles at start and from the person's prompts, read by every feature module.
export const session = {
  lang: 'en' as Lang,
  // The language the person writes in, from their last prompt that told.
  voice: undefined as Voice | undefined,
  // Every variable the platform decisions read, read once at session start.
  env: {} as Env,
}

export const t = () => STRINGS[session.lang]
