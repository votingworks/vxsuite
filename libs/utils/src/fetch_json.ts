export async function fetchJSON(
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
    throw new Error('fetch response is not ok');
  }

  return await response.json();
}
