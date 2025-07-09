import {
  makeMockGoogleCloudTextToSpeechClient,
  makeMockGoogleCloudTranslationClient,
  VendoredTranslations,
} from '@votingworks/backend';
import { assertDefined, err, find, ok, Result } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import { mockBaseLogger, mockLogger } from '@votingworks/logging';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import {
  ElectionId,
  ElectionSerializationFormat,
  LanguageCode,
} from '@votingworks/types';
import { Request } from 'express';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Readable } from 'stream';
import * as tmp from 'tmp';
import { vi } from 'vitest';
import type { Api, ApiContext } from '../src/app';
import { buildApp } from '../src/app';
import { Auth0ClientInterface } from '../src/auth0_client';
import {
  FileStorageClient,
  FileStorageClientError,
} from '../src/file_storage_client';
import { GoogleCloudSpeechSynthesizerWithDbCache } from '../src/speech_synthesizer';
import { GoogleCloudTranslatorWithDbCache } from '../src/translator';
import { Org, User } from '../src/types';
import * as worker from '../src/worker/worker';
import { createWorkspace, Workspace } from '../src/workspace';
import { TestStore } from './test_store';
import { getEntries, openZip, readEntry } from '@votingworks/utils/src';
import { join } from 'node:path';

tmp.setGracefulCleanup();

export type ApiClient = grout.Client<Api>;

const vendoredTranslations: VendoredTranslations = {
  [LanguageCode.CHINESE_SIMPLIFIED]: {},
  [LanguageCode.CHINESE_TRADITIONAL]: {},
  [LanguageCode.SPANISH]: {},
};

class MockAuth0Client implements Auth0ClientInterface {
  private loggedInUser: User | undefined;
  private orgs: readonly Org[] = [];

  setLoggedInUser(user: User) {
    this.loggedInUser = user;
  }

  setOrgs(orgs: readonly Org[]) {
    this.orgs = orgs;
  }

  async allOrgs(): Promise<Org[]> {
    return this.orgs.slice();
  }

  async userFromRequest(_req: Request) {
    return this.loggedInUser;
  }
}

class MockFileStorageClient implements FileStorageClient {
  private mockFiles: Record<string, Buffer> = {};

  getRawFile(filePath: string): Buffer | undefined {
    return this.mockFiles[filePath];
  }

  async readFile(
    filePath: string
  ): Promise<Result<Readable, FileStorageClientError>> {
    const file = this.mockFiles[filePath];
    if (!file) {
      return err({ type: 'undefined-body' });
    }
    return ok(Readable.from(file));
  }

  async writeFile(
    filePath: string,
    contents: Buffer
  ): Promise<Result<void, FileStorageClientError>> {
    this.mockFiles[filePath] = contents;
    return ok();
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function testSetupHelpers() {
  const servers: Server[] = [];

  const baseLogger = mockBaseLogger({ fn: vi.fn });
  const logger = mockLogger({
    getCurrentRole: () => Promise.resolve('system'),
    fn: vi.fn,
  });
  const testStore = new TestStore(baseLogger);

  async function setupApp() {
    const store = testStore.getStore();
    await testStore.init();

    const workspace = createWorkspace(tmp.dirSync().name, baseLogger, store);

    const auth0 = new MockAuth0Client();
    const fileStorageClient = new MockFileStorageClient();
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
    const app = buildApp({
      auth0,
      fileStorageClient,
      logger,
      speechSynthesizer,
      translator,
      workspace,
    });
    const server = app.listen();
    servers.push(server);
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://localhost:${port}`;
    const apiClient = grout.createClient<Api>({
      baseUrl: join(baseUrl, '/api'),
    });
    return {
      baseUrl,
      apiClient,
      workspace,
      auth0,
      fileStorageClient,
      logger,
      translator,
      speechSynthesizer,
    };
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

export async function processNextBackgroundTaskIfAny({
  fileStorageClient,
  workspace,
}: {
  fileStorageClient: FileStorageClient;
  workspace: Workspace;
}): Promise<void> {
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
      fileStorageClient,
      speechSynthesizer,
      translator,
      workspace,
    })
  );
}

export const ELECTION_PACKAGE_FILE_NAME_REGEX =
  /election-package-and-ballots-([0-9a-z]{7})-([0-9a-z]{7})\.zip$/;

export async function exportElectionPackage({
  apiClient,
  electionId,
  fileStorageClient,
  workspace,
  electionSerializationFormat,
  shouldExportAudio = false,
  numAuditIdBallots,
}: {
  apiClient: ApiClient;
  electionId: ElectionId;
  fileStorageClient: FileStorageClient;
  workspace: Workspace;
  electionSerializationFormat: ElectionSerializationFormat;
  shouldExportAudio: boolean;
  numAuditIdBallots?: number;
}): Promise<string> {
  await apiClient.exportElectionPackage({
    electionId,
    electionSerializationFormat,
    shouldExportAudio,
    numAuditIdBallots,
  });
  await processNextBackgroundTaskIfAny({
    fileStorageClient,
    workspace,
  });

  const electionPackage = await apiClient.getElectionPackage({
    electionId,
  });
  return assertDefined(
    assertDefined(electionPackage.url).match(ELECTION_PACKAGE_FILE_NAME_REGEX)
  )[0];
}

/**
 * Given a nested zip containing an election package zip,
 * parses the election package from the parent zip and hashes the raw contents.
 */
export async function unzipElectionPackageAndBallots(fileContents: Buffer) {
  const zipFile = await openZip(fileContents);
  const entries = getEntries(zipFile);
  const electionPackageEntry = find(
    entries,
    (e) => !!e.name.match(/election-package-.*\.zip/)
  );
  const ballotsEntry = find(entries, (e) => !!e.name.match(/ballots-.*\.zip/));

  return {
    electionPackageContents: await readEntry(electionPackageEntry),
    electionPackageFileName: electionPackageEntry.name,
    ballotsContents: await readEntry(ballotsEntry),
    ballotsFileName: ballotsEntry.name,
  };
}

export const TEST_DECKS_FILE_NAME_REGEX = /test-decks-([0-9a-z]{7})\.zip$/;

export async function exportTestDecks({
  apiClient,
  electionId,
  fileStorageClient,
  workspace,
  electionSerializationFormat,
}: {
  apiClient: ApiClient;
  electionId: ElectionId;
  fileStorageClient: FileStorageClient;
  workspace: Workspace;
  electionSerializationFormat: ElectionSerializationFormat;
}): Promise<string> {
  await apiClient.exportTestDecks({
    electionId,
    electionSerializationFormat,
  });
  await processNextBackgroundTaskIfAny({
    fileStorageClient,
    workspace,
  });

  const testDecks = await apiClient.getTestDecks({
    electionId,
  });
  return assertDefined(
    assertDefined(testDecks.url).match(TEST_DECKS_FILE_NAME_REGEX)
  )[0];
}
