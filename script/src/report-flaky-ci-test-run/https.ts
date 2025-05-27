import assert from 'node:assert';
import { OutgoingHttpHeaders } from 'node:http';
import * as https from 'node:https';

function readStreamAsUtf8(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let string = '';
    stream.setEncoding('utf8');
    stream.on('readable', () => {
      const chunk = stream.read();
      if (typeof chunk === 'string') {
        string += chunk;
      }
    });
    stream.on('error', reject);
    stream.on('end', () => {
      resolve(string);
    });
  });
}

export function getJson(url: string): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    https.get(
      url,
      { headers: { accept: 'application/json' } },
      async (response) => {
        const body = await readStreamAsUtf8(response);

        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Unexpected status: ${response.statusCode} ${response.statusMessage}, body=${body}`
            )
          );
        } else {
          resolve(JSON.parse(body));
        }
      }
    );
  });
}

export function post(
  url: string,
  data: unknown,
  options?: { headers?: OutgoingHttpHeaders }
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const outgoingBody =
      options?.headers?.['content-type'] !== 'application/json' ||
      typeof data === 'string'
        ? data
        : JSON.stringify(data);
    assert(
      typeof outgoingBody === 'string' ||
        outgoingBody instanceof Uint8Array ||
        Buffer.isBuffer(outgoingBody)
    );

    const headers: OutgoingHttpHeaders = {
      'content-length': Buffer.byteLength(outgoingBody),
      accept: 'application/json',
      ...options?.headers,
    };
    const request = https.request(
      url,
      {
        method: 'POST',
        headers,
      },
      async (response) => {
        const body = await readStreamAsUtf8(response);

        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Unexpected status: ${response.statusCode} ${response.statusMessage}, body=${body}`
            )
          );
        } else {
          if (
            response.headers['content-type']?.startsWith('application/json')
          ) {
            resolve(JSON.parse(body));
          } else {
            resolve(body);
          }
        }
      }
    );

    request.end(outgoingBody);
  });
}
