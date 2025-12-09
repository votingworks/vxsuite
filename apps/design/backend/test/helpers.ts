import {
  makeMockGoogleCloudTextToSpeechClient,
  makeMockGoogleCloudTranslationClient,
  VendoredTranslations,
} from '@votingworks/backend';
import {
  assert,
  assertDefined,
  err,
  find,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import { mockBaseLogger, mockLogger } from '@votingworks/logging';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import {
  Election,
  ElectionDefinition,
  ElectionId,
  ElectionSerializationFormat,
  formatBallotHash,
  LanguageCode,
} from '@votingworks/types';
import { Request } from 'express';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Readable } from 'stream';
import * as tmp from 'tmp';
import { vi } from 'vitest';
import type { Api, ApiContext, UnauthenticatedApi } from '../src/app';
import { buildApp } from '../src/app';
import { Auth0ClientInterface } from '../src/auth0_client';
import {
  FileStorageClient,
  FileStorageClientError,
} from '../src/file_storage_client';
import { GoogleCloudSpeechSynthesizerWithDbCache } from '../src/speech_synthesizer';
import { GoogleCloudTranslatorWithDbCache } from '../src/translator';
import { Jurisdiction, Organization, User } from '../src/types';
import * as worker from '../src/worker/worker';
import { createWorkspace, Workspace } from '../src/workspace';
import { TestStore } from './test_store';
import { getEntries, openZip, readEntry } from '@votingworks/utils/src';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { stringify } from 'csv-stringify/sync';
import { AllPrecinctsTallyReportRow } from '../src/convert_ms_results';

tmp.setGracefulCleanup();

export type ApiClient = grout.Client<Api>;

const vendoredTranslations: VendoredTranslations = {
  [LanguageCode.CHINESE_SIMPLIFIED]: {},
  [LanguageCode.CHINESE_TRADITIONAL]: {},
  [LanguageCode.SPANISH]: {},
};

class MockAuth0Client implements Auth0ClientInterface {
  private loggedInUser: User | undefined;

  setLoggedInUser(user: User) {
    this.loggedInUser = user;
  }

  logOut() {
    this.loggedInUser = undefined;
  }

  userIdFromRequest(_req: Request) {
    return this.loggedInUser?.id;
  }
}

export class MockFileStorageClient implements FileStorageClient {
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

  async function setupApp({
    organizations,
    jurisdictions,
    users,
  }: {
    organizations: Organization[];
    jurisdictions: Jurisdiction[];
    users: User[];
  }) {
    const store = testStore.getStore();
    await testStore.init();
    for (const organization of organizations) {
      await store.createOrganization(organization);
    }
    for (const jurisdiction of jurisdictions) {
      await store.createJurisdiction(jurisdiction);
    }
    for (const user of users) {
      await store.createUser(user);
      for (const jurisdiction of user.jurisdictions) {
        await store.addUserToJurisdiction(user.id, jurisdiction.id);
      }
    }
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
      baseUrl: `${baseUrl}/api`,
    });
    const unauthenticatedApiClient = grout.createClient<UnauthenticatedApi>({
      baseUrl: `${baseUrl}/public/api`,
    });
    return {
      baseUrl,
      apiClient,
      unauthenticatedApiClient,
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
  shouldExportAudio,
  shouldExportSampleBallots,
  numAuditIdBallots,
}: {
  apiClient: ApiClient;
  electionId: ElectionId;
  fileStorageClient: FileStorageClient;
  workspace: Workspace;
  electionSerializationFormat: ElectionSerializationFormat;
  shouldExportAudio: boolean;
  shouldExportSampleBallots: boolean;
  numAuditIdBallots?: number;
}): Promise<string> {
  await apiClient.exportElectionPackage({
    electionId,
    electionSerializationFormat,
    shouldExportAudio,
    shouldExportSampleBallots,
    numAuditIdBallots,
  });
  await processNextBackgroundTaskIfAny({
    fileStorageClient,
    workspace,
  });

  const electionPackage = await apiClient.getElectionPackage({
    electionId,
  });
  assert(
    electionPackage.task?.error === undefined,
    'Election package export failed with error: ' + electionPackage.task?.error
  );
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

const fixturesPath = `${__dirname}/../test/fixtures`;

export function readFixture(filename: string): string {
  return readFileSync(join(fixturesPath, filename), 'utf8');
}

export function generateAllPrecinctsTallyReportRows(
  election: Election
): AllPrecinctsTallyReportRow[] {
  return election.precincts.flatMap((precinct) =>
    election.contests.flatMap((contest, contestIndex) => {
      const rowBase = {
        precinct: precinct.name,
        precinctId: precinct.id,
        contest: contest.title,
        contestId: contest.id,
      } as const;
      const overvotesAndUndervotesRows = [
        {
          ...rowBase,
          selection: 'Overvotes',
          selectionId: 'overvotes',
          totalVotes: `${contestIndex}`,
        },
        {
          ...rowBase,
          selection: 'Undervotes',
          selectionId: 'undervotes',
          totalVotes: `${contestIndex}`,
        },
      ];
      switch (contest.type) {
        case 'candidate': {
          return [
            ...contest.candidates.map((candidate, candidateIndex) => ({
              ...rowBase,
              selection: candidate.name,
              selectionId: candidate.id,
              totalVotes: `${candidateIndex}`,
            })),
            ...(contest.allowWriteIns
              ? // Simulate a fixed number of write-ins to make sure we aggregate them correctly
                // (even though the contest might only be vote-for-1)
                [
                  // Unadjudicated write-in
                  {
                    ...rowBase,
                    selection: 'Unadjudicated Write-in',
                    selectionId: 'write-in',
                    totalVotes: '1',
                  },
                  // Adjudicated write-ins
                  {
                    ...rowBase,
                    selection: 'some candidate (Write-In)',
                    selectionId: '8f143904-b942-4a8e-b45d-19abc3eaa645',
                    totalVotes: '1',
                  },
                  {
                    ...rowBase,
                    selection: 'another candidate (Write-In)',
                    selectionId: '89f98ae8-8a8e-44f3-a2e2-0cce368e1ba2',
                    totalVotes: '1',
                  },
                ]
              : []),
            ...overvotesAndUndervotesRows,
          ];
        }
        case 'yesno': {
          return [
            {
              precinct: precinct.name,
              precinctId: precinct.id,
              contest: contest.title,
              contestId: contest.id,
              selection: contest.yesOption.label,
              selectionId: contest.yesOption.id,
              totalVotes: `${contestIndex}`,
            },
            {
              precinct: precinct.name,
              precinctId: precinct.id,
              contest: contest.title,
              contestId: contest.id,
              selection: contest.noOption.label,
              selectionId: contest.noOption.id,
              totalVotes: `${contestIndex + 1}`,
            },
            ...overvotesAndUndervotesRows,
          ];
        }
        default: {
          return throwIllegalValue(contest);
        }
      }
    })
  );
}

export function stringifyAllPrecinctsTallyReportRows(
  rows: AllPrecinctsTallyReportRow[]
): string {
  return stringify(rows, {
    header: true,
    columns: {
      precinct: 'Precinct',
      precinctId: 'Precinct ID',
      contest: 'Contest',
      contestId: 'Contest ID',
      selection: 'Selection',
      selectionId: 'Selection ID',
      totalVotes: 'Total Votes',
    },
  });
}

export function generateAllPrecinctsTallyReportMetadataRow(
  electionDefinition: ElectionDefinition
): string {
  return `official-tally-report-by-precinct,Election ID: ${formatBallotHash(
    electionDefinition.ballotHash
  )}\n`;
}

export function generateAllPrecinctsTallyReport(
  electionDefinition: ElectionDefinition
): string {
  return (
    generateAllPrecinctsTallyReportMetadataRow(electionDefinition) +
    stringifyAllPrecinctsTallyReportRows(
      generateAllPrecinctsTallyReportRows(electionDefinition.election)
    )
  );
}
