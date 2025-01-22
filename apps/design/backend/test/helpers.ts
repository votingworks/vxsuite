import { vi } from 'vitest';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import path from 'node:path';
import * as tmp from 'tmp';
import * as grout from '@votingworks/grout';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { assertDefined } from '@votingworks/basics';
import { ElectionSerializationFormat, LanguageCode } from '@votingworks/types';
import { mockBaseLogger } from '@votingworks/logging';
import {
  makeMockGoogleCloudTextToSpeechClient,
  makeMockGoogleCloudTranslationClient,
  VendoredTranslations,
} from '@votingworks/backend';
import { buildApp } from '../src/app';
import type { Api } from '../src/app';
import { Workspace, createWorkspace } from '../src/workspace';
import * as worker from '../src/worker/worker';
import { GoogleCloudTranslatorWithDbCache } from '../src/translator';
import { GoogleCloudSpeechSynthesizerWithDbCache } from '../src/speech_synthesizer';
import { TestStore } from './test_store';

tmp.setGracefulCleanup();

export type ApiClient = grout.Client<Api>;

const vendoredTranslations: VendoredTranslations = {
  [LanguageCode.CHINESE_SIMPLIFIED]: {},
  [LanguageCode.CHINESE_TRADITIONAL]: {},
  [LanguageCode.SPANISH]: {},
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function testSetupHelpers() {
  const servers: Server[] = [];

  const logger = mockBaseLogger({ fn: vi.fn });
  const testStore = new TestStore(logger);

  async function setupApp() {
    const store = testStore.getStore();
    await testStore.init();

    const workspace = createWorkspace(tmp.dirSync().name, logger, store);

    const speechSynthesizer = new GoogleCloudSpeechSynthesizerWithDbCache({
      store,
      textToSpeechClient: makeMockGoogleCloudTextToSpeechClient({
        fn: vi.fn,
      }),
    });
    const translator = new GoogleCloudTranslatorWithDbCache({
      store,
      translationClient: makeMockGoogleCloudTranslationClient({ fn: vi.fn }),
      vendoredTranslations,
    });
    const app = buildApp({ speechSynthesizer, translator, workspace });
    const server = app.listen();
    servers.push(server);
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://localhost:${port}/api`;
    const apiClient = grout.createClient<Api>({ baseUrl });
    return { apiClient, workspace };
  }

  async function cleanup() {
    for (const server of servers) {
      server.close();
    }
    await testStore.cleanUp();
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
  const speechSynthesizer = new GoogleCloudSpeechSynthesizerWithDbCache({
    store,
    textToSpeechClient: makeMockGoogleCloudTextToSpeechClient({ fn: vi.fn }),
  });
  const translator = new GoogleCloudTranslatorWithDbCache({
    store,
    translationClient: makeMockGoogleCloudTranslationClient({ fn: vi.fn }),
    vendoredTranslations,
  });

  await suppressingConsoleOutput(() =>
    worker.processNextBackgroundTaskIfAny({
      speechSynthesizer,
      translator,
      workspace,
    })
  );
}

export const ELECTION_PACKAGE_FILE_NAME_REGEX =
  /election-package-([0-9a-z]{7})-([0-9a-z]{7})\.zip$/;

export async function exportElectionPackage({
  apiClient,
  electionId,
  workspace,
  electionSerializationFormat,
}: {
  apiClient: ApiClient;
  electionId: string;
  workspace: Workspace;
  electionSerializationFormat: ElectionSerializationFormat;
}): Promise<string> {
  await apiClient.exportElectionPackage({
    electionId,
    electionSerializationFormat,
  });
  await processNextBackgroundTaskIfAny(workspace);

  const electionPackage = await apiClient.getElectionPackage({
    electionId,
  });
  const electionPackageFileName = assertDefined(
    assertDefined(electionPackage.url).match(ELECTION_PACKAGE_FILE_NAME_REGEX)
  )[0];
  const electionPackageFilePath = path.join(
    workspace.assetDirectoryPath,
    electionPackageFileName
  );

  return electionPackageFilePath;
}
