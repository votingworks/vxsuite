/* eslint-disable max-classes-per-file */
import { Server } from 'http';
import { AddressInfo } from 'net';
import * as tmp from 'tmp';
import * as grout from '@votingworks/grout';
import { buildApp } from '../src/app';
import { Store } from '../src/store';
import type { Api } from '../src/app';
import { MinimalGoogleCloudTranslationClient } from '../src/language_and_audio/translator';
import { MinimalGoogleCloudTextToSpeechClient } from '../src/language_and_audio/speech_synthesizer';

tmp.setGracefulCleanup();

export type ApiClient = grout.Client<Api>;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function testSetupHelpers() {
  const servers: Server[] = [];

  function setupApp() {
    const store = Store.fileStore(tmp.fileSync().name);
    const app = buildApp({ store });
    const server = app.listen();
    servers.push(server);
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://localhost:${port}/api`;
    const apiClient = grout.createClient<Api>({ baseUrl });
    return { apiClient };
  }

  function cleanup() {
    for (const server of servers) {
      server.close();
    }
  }

  return {
    setupApp,
    cleanup,
  };
}

export class MockGoogleCloudTranslationClient
  implements MinimalGoogleCloudTranslationClient
{
  // eslint-disable-next-line vx/gts-no-public-class-fields
  translateText = jest.fn(
    (input: {
      contents: string[];
      targetLanguageCode: string;
    }): Promise<
      [
        { translations: Array<{ translatedText: string }> },
        undefined,
        undefined,
      ]
    > =>
      Promise.resolve([
        {
          translations: input.contents.map((text) => ({
            translatedText: `${text} (in ${input.targetLanguageCode})`,
          })),
        },
        undefined,
        undefined,
      ])
  );
}

export class MockGoogleCloudTextToSpeechClient
  implements MinimalGoogleCloudTextToSpeechClient
{
  // eslint-disable-next-line vx/gts-no-public-class-fields
  synthesizeSpeech = jest.fn(
    (input: {
      input: { text: string };
    }): Promise<
      [{ audioContent: string | Uint8Array }, undefined, undefined]
    > =>
      Promise.resolve([
        { audioContent: `${input.input.text} (audio)` },
        undefined,
        undefined,
      ])
  );
}
