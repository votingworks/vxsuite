export default async function fetchJSON<Res>(
  input: RequestInfo,
  init?: RequestInit
): Promise<Res> {
  const response = await fetch(input, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    throw new Error('fetch response is not ok')
  }

  const json: Res = await response.json()

  return json
}
