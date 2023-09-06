// eslint-disable-next-line import/no-unresolved
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

export function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    stream.on('data', (chunk: string) => chunks.push(chunk));
    stream.on('end', () => resolve(chunks.join('')));
    stream.on('error', reject);
  });
}
