const PLACEHOLDER = /\[Pasted text #(\d+)/g

export const pastedNumbers = (text: string) => [...new Set([...text.matchAll(PLACEHOLDER)].map(m => Number(m[1])))]

// The placeholder numbers an edit added: the ones in the box after it that were not there before.
export function newPastes(before: string, after: string): number[] {
  const had = new Set(pastedNumbers(before))
  return pastedNumbers(after).filter(n => !had.has(n))
}
