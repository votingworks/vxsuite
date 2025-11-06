import { generateFileTimeSuffix } from '@votingworks/utils';
import { parse } from 'csv-parse/sync';

export function parseCsv(fileContents: string): {
  metadata: {
    title: string;
    ballotHash: string;
  };
  headers: string[];
  rows: Array<{ [header: string]: string }>;
} {
  const [title, electionId] = parse(fileContents, { to: 1 })[0];
  const ballotHash = electionId.replace('Election ID: ', '');
  return {
    metadata: { title, ballotHash },
    headers: parse(fileContents, { fromLine: 2, to: 1 })[0],
    rows: parse(fileContents, { fromLine: 2, columns: true }),
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

export function mockFileName(extension = 'csv'): string {
  return `test-file-name__${generateFileTimeSuffix()}.${extension}`;
}
