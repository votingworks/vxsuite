import { parse } from 'csv-parse/sync';

export function parseCsv(fileContents: string): {
  headers: string[];
  rows: Array<{ [header: string]: string }>;
} {
  return {
    headers: parse(fileContents, { to: 1 })[0],
    rows: parse(fileContents, { columns: true }),
  };
}

export async function iterableToString(
  iterable: Iterable<string> | AsyncIterable<string>
): Promise<string> {
  let result = '';
  for await (const chunk of iterable) {
    result += chunk;
  }
  return result;
}
