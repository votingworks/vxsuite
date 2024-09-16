import { Buffer } from 'node:buffer';
import { createInterface } from 'node:readline';
import { inspect } from 'node:util';
import { parseRequest, parseResponse } from '../../protocol';
import { convertFromInternalStatus } from '../../status';

/**
 * Analyzes packets sent to and received from the scanner.
 */
export async function main(): Promise<number> {
  const lines = createInterface(process.stdin);

  for await (const line of lines) {
    if (/^\s*$/.test(line)) {
      continue;
    }

    const buffer = Buffer.from(line, 'hex');
    const parsedResponse = parseResponse(buffer);

    if (parsedResponse) {
      if (parsedResponse.type === 'StatusInternalMessage') {
        const { status, a4Status } = convertFromInternalStatus(
          parsedResponse.value
        );
        process.stdout.write(
          `⬅ {\n  ${parsedResponse.type} ${inspect(
            parsedResponse.value
          ).replaceAll('\n', '\n  ')}\n  ScannerStatus ${inspect(
            status
          ).replaceAll('\n', '\n  ')}\n  ScannerA4Status ${inspect(
            a4Status
          ).replaceAll('\n', '\n  ')}\n}\n`
        );
      } else {
        process.stdout.write(
          `⬅ ${parsedResponse.type} ${
            parsedResponse.value ? inspect(parsedResponse.value) : ''
          }\n`
        );
      }
      continue;
    }

    const parsedRequest = parseRequest(buffer);

    if (parsedRequest) {
      process.stdout.write(
        `➡ ${parsedRequest.type} ${
          parsedRequest.value ? inspect(parsedRequest.value) : ''
        }\n`
      );
      continue;
    }

    process.stdout.write(
      `⚠️ ${inspect(buffer.toString()).replace(/^'|'$/g, '')} ${inspect(
        buffer
      )}\n`
    );
  }

  return 0;
}
