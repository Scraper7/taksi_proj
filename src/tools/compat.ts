export function objectFromEntries<T = any>(entries: Iterable<readonly [PropertyKey, T]>): Record<string, T> {
  const result: Record<string, T> = {}
  for (const entry of entries as any) {
    if (!entry) continue
    result[String(entry[0])] = entry[1]
  }
  return result
}

export function replaceAllString(value: unknown, searchValue: string, replaceValue: string) {
  return String(value ?? '').split(searchValue).join(replaceValue)
}

export function promiseAllSettled<T>(items: Iterable<Promise<T> | T>) {
  return Promise.all(Array.from(items, item =>
    Promise.resolve(item).then(
      value => ({ status: 'fulfilled' as const, value }),
      reason => ({ status: 'rejected' as const, reason }),
    ),
  ))
}
