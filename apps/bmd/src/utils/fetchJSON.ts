export default async function fetchJSON<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...((init && init.headers) || {}),
    },
  })

  if (!response.ok) {
    throw new Error('fetch response is not ok')
  }

  const json: T = await response.json()

  return json
}
