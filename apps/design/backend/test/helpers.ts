/* eslint-disable max-classes-per-file */
import { Buffer } from 'buffer';
import fs from 'fs';
import { Server } from 'http';
import { AddressInfo } from 'net';
import path from 'path';
import * as tmp from 'tmp';
import * as grout from '@votingworks/grout';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { assertDefined } from '@votingworks/basics';
import { buildApp } from '../src/app';
import type { Api } from '../src/app';
import {
  GoogleCloudTranslator,
  MinimalGoogleCloudTranslationClient,
} from '../src/language_and_audio/translator';
import {
  GoogleCloudSpeechSynthesizer,
  MinimalGoogleCloudTextToSpeechClient,
} from '../src/language_and_audio/speech_synthesizer';
import { Workspace, createWorkspace } from '../src/workspace';
import * as worker from '../src/worker/worker';

tmp.setGracefulCleanup();

export type ApiClient = grout.Client<Api>;

export function mockCloudTranslatedText(
  englishText: string,
  languageCode: string
): string {
  return `${englishText} (in ${languageCode})`;
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
            translatedText: mockCloudTranslatedText(
              text,
              input.targetLanguageCode
            ),
          })),
        },
        undefined,
        undefined,
      ])
  );
}

export function mockCloudSynthesizedSpeech(text: string): string {
  return `${text} (audio)`;
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
        { audioContent: mockCloudSynthesizedSpeech(input.input.text) },
        undefined,
        undefined,
      ])
  );
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function testSetupHelpers() {
  const servers: Server[] = [];

  function setupApp() {
    const workspace = createWorkspace(tmp.dirSync().name);
    const { store } = workspace;
    const speechSynthesizer = new GoogleCloudSpeechSynthesizer({
      store,
      textToSpeechClient: new MockGoogleCloudTextToSpeechClient(),
    });
    const translator = new GoogleCloudTranslator({
      store,
      translationClient: new MockGoogleCloudTranslationClient(),
    });
    const app = buildApp({ speechSynthesizer, translator, workspace });
    const server = app.listen();
    servers.push(server);
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://localhost:${port}/api`;
    const apiClient = grout.createClient<Api>({ baseUrl });
    return { apiClient, workspace };
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

export async function processNextBackgroundTaskIfAny(
  workspace: Workspace
): Promise<void> {
  const { store } = workspace;
  const speechSynthesizer = new GoogleCloudSpeechSynthesizer({
    store,
    textToSpeechClient: new MockGoogleCloudTextToSpeechClient(),
  });
  const translator = new GoogleCloudTranslator({
    store,
    translationClient: new MockGoogleCloudTranslationClient(),
  });

  await suppressingConsoleOutput(() =>
    worker.processNextBackgroundTaskIfAny({
      speechSynthesizer,
      translator,
      workspace,
    })
  );
}

export async function exportElectionPackage({
  apiClient,
  electionId,
  workspace,
}: {
  apiClient: ApiClient;
  electionId: string;
  workspace: Workspace;
}): Promise<Buffer> {
  await apiClient.exportElectionPackage({ electionId });
  await processNextBackgroundTaskIfAny(workspace);

  const electionPackage = await apiClient.getElectionPackage({
    electionId,
  });
  const electionPackageFileName = assertDefined(
    assertDefined(electionPackage.url).match(
      /election-package-[0-9a-z]{10}\.zip$/
    )
  )[0];
  const electionPackageContents = fs.readFileSync(
    path.join(workspace.assetDirectoryPath, electionPackageFileName)
  );

  return electionPackageContents;
}
