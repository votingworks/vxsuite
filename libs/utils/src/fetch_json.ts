export async function fetchJson(
  input: RequestInfo,
  init?: RequestInit
): Promise<unknown> {
  const response = await fetch(input, {
    ...(init ?? {}),
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Received ${response.status} status code`);
  }

  return await response.json();
}
