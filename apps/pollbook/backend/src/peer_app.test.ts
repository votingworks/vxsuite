import { beforeEach, expect, test, vi } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { join } from 'node:path';
import fetch from 'node-fetch';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import {
  parseValidStreetsFromCsvString,
  parseVotersFromCsvString,
} from './pollbook_package';
import { withApp } from '../test/app';

let mockNodeEnv: 'production' | 'test' = 'test';

const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

vi.mock(
  './globals.js',
  async (importActual): Promise<typeof import('./globals')> => ({
    ...(await importActual()),
    get NODE_ENV(): 'production' | 'test' {
      return mockNodeEnv;
    },
  })
);

beforeEach(() => {
  mockNodeEnv = 'test';
  vi.clearAllMocks();
});

test('getPollbookConfigurationInformation', async () => {
  await withApp(async ({ peerApiClient, workspace }) => {
    expect(
      await peerApiClient.getPollbookConfigurationInformation()
    ).toMatchObject({
      machineId: '0102',
    });

    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'fake-package-hash',
      testStreets,
      testVoters
    );

    expect(
      await peerApiClient.getPollbookConfigurationInformation()
    ).toMatchObject({
      electionBallotHash: electionDefinition.ballotHash,
      electionId: electionDefinition.election.id,
      electionTitle: electionDefinition.election.title,
      pollbookPackageHash: 'fake-package-hash',
      machineId: '0102',
    });
  });
});

test('GET /file/pollbook-package returns 404 if file does not exist, 200 if it does', async () => {
  await withApp(async ({ peerServer, workspace }) => {
    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    // Ensure no file exists
    const zipPath = join(workspace.assetDirectoryPath, 'pollbook-package.zip');
    if (existsSync(zipPath)) {
      unlinkSync(zipPath);
    }
    const { port } = peerServer.address() as AddressInfo;

    // Should return 404 when the pollbook is unconfigured
    const responseUnconfig = await fetch(
      `http://localhost:${port}/file/pollbook-package`
    );
    expect(responseUnconfig.status).toEqual(404);
    expect(await responseUnconfig.text()).toEqual('Pollbook package not found');

    workspace.store.setElectionAndVoters(
      electionDefinition,
      'fake-package-hash',
      testStreets,
      testVoters
    );

    // Should return 404 when file does not exist
    const responseNoFile = await fetch(
      `http://localhost:${port}/file/pollbook-package`
    );
    expect(responseNoFile.status).toEqual(404);
    expect(await responseNoFile.text()).toEqual('Pollbook package not found');

    // Write a dummy zip file
    writeFileSync(zipPath, 'fakecontent');

    // Should return 200 and correct headers when file exists
    const responseOk = await fetch(
      `http://localhost:${port}/file/pollbook-package`
    );
    expect(responseOk.headers.get('content-type')).toEqual('application/zip');
    expect(responseOk.headers.get('content-disposition')).toContain(
      'attachment; filename="pollbook-package.zip"'
    );
    const bodyContent = await responseOk.text();
    expect(bodyContent.length).toBeGreaterThan(0);
    expect(bodyContent).toEqual('fakecontent');

    // Cleanup
    if (existsSync(zipPath)) {
      unlinkSync(zipPath);
    }
  });
});
