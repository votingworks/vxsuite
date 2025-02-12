import { Mocked, vi } from 'vitest';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import path from 'node:path';
import * as tmp from 'tmp';
import * as grout from '@votingworks/grout';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { assertDefined, err, ok, Result, typedAs } from '@votingworks/basics';
import {
  ElectionId,
  ElectionSerializationFormat,
  LanguageCode,
} from '@votingworks/types';
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
import { AuthClient } from '../src/auth/client';
import { Auth0User, Org, User } from '../src/types';
import { Request } from 'express';
import {
  FileStorageClient,
  FileStorageClientError,
} from '../src/file_storage_client';
import { Readable } from 'stream';

tmp.setGracefulCleanup();

export type ApiClient = grout.Client<Api>;

const vendoredTranslations: VendoredTranslations = {
  [LanguageCode.CHINESE_SIMPLIFIED]: {},
  [LanguageCode.CHINESE_TRADITIONAL]: {},
  [LanguageCode.SPANISH]: {},
};

class MockAuthClient extends AuthClient {
  private mockAllOrgs: readonly Org[] = [];
  private mockHasAccess: AuthClient['hasAccess'] = () => true;
  private mockUserFromRequest: AuthClient['userFromRequest'] = () => undefined;

  constructor(
    allOrgs: readonly Org[] = [],
    hasAccess: (user: User, orgId: string) => boolean = () => true
  ) {
    super(undefined as any, undefined as any);
    this.mockAllOrgs = allOrgs;
    this.mockHasAccess = hasAccess;
  }

  public async allOrgs(): Promise<Org[]> {
    return this.mockAllOrgs.slice();
  }

  hasAccess(user: User, orgId: string): boolean {
    return this.mockHasAccess(user, orgId);
  }

  async org(id: string): Promise<Org | undefined> {
    for (const org of this.mockAllOrgs) {
      if (org.id === id) {
        return org;
      }
    }
  }

  userFromRequest(req: Request): Auth0User | undefined {
    return this.mockUserFromRequest(req);
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

  const logger = mockBaseLogger({ fn: vi.fn });
  const testStore = new TestStore(logger);

  async function setupApp() {
    const store = testStore.getStore();
    await testStore.init();

    const workspace = createWorkspace(tmp.dirSync().name, logger, store);

    const auth = new MockAuthClient();
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
      auth,
      fileStorageClient,
      speechSynthesizer,
      translator,
      workspace,
    });
    const server = app.listen();
    servers.push(server);
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://localhost:${port}/api`;
    const apiClient = grout.createClient<Api>({ baseUrl });
    return { apiClient, workspace, auth, fileStorageClient };
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
  user,
  apiClient,
  electionId,
  fileStorageClient,
  workspace,
  electionSerializationFormat,
}: {
  user: User;
  apiClient: ApiClient;
  electionId: ElectionId;
  fileStorageClient: FileStorageClient;
  workspace: Workspace;
  electionSerializationFormat: ElectionSerializationFormat;
}): Promise<string> {
  await apiClient.exportElectionPackage({
    user,
    electionId,
    electionSerializationFormat,
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
