export const createRequestMock = (
  headers: Record<string, string> = {}
): { headers: { get(name: string): string | null } } => {
  const normalized = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    headers: {
      get: (name: string) => normalized[name.toLowerCase()] ?? null
    }
  }
}
