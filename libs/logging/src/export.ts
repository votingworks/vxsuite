import { lines } from '@votingworks/basics';

export async function* filterErrorLogs(
  inputStream: AsyncIterable<string>
): AsyncIterable<string> {
  const inputLines = lines(inputStream).filter((l) => l !== '');
  for await (const line of inputLines) {
    try {
      const obj = JSON.parse(line);
      if (obj['disposition'] && obj.disposition === 'failure') {
        yield line;
      }
    } catch {
      // Skip this line if there are any errors parsing the JSON
    }
  }
}

export type LogExportFormat = 'vxf' | 'cdf' | 'err';
