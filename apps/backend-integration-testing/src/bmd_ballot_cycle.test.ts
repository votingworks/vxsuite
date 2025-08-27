import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import { test, expect } from 'vitest';
import { HP_LASER_PRINTER_CONFIG } from '@votingworks/printing';
import { assert } from '@votingworks/basics';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { readFileSync } from 'node:fs';
import { withAdmin } from '../test/apps/admin';
import { withMark } from '../test/apps/mark';
import { scanBallot, withScan } from '../test/apps/scan';
import * as InsertedAuth from '../test/auth/inserted';
import * as DippedAuth from '../test/auth/dipped';

test('full BMD ballot cycle', async () => {
  const mockUsbDrive = getMockFileUsbDriveHandler();

  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { election } = electionDefinition;
  const { electionPackage } = electionFamousNames2021Fixtures;

  const artifactPaths: Record<string, string> = {};

  // configure and export the signed election package to the USB drive at VxAdmin
  await withAdmin(async ({ apiClient }) => {
    await DippedAuth.mockSystemAdministratorAuth(apiClient);
    mockUsbDrive.insert();
    (
      await apiClient.configure({
        electionFilePath: electionPackage.asFilePath(),
      })
    ).assertOk('configuration failed');
    (await apiClient.saveElectionPackageToUsb()).assertOk(
      'save election package failed'
    );
    await apiClient.logOut();
  });

  // configure VxMark and produce a ballot
  await withMark(async ({ apiClient, mockPrinterHandler }) => {
    await InsertedAuth.mockElectionManagerAuth(apiClient, election);
    mockUsbDrive.insert();
    (await apiClient.configureElectionPackageFromUsb()).assertOk(
      'configuration failed'
    );
    await apiClient.setTestMode({ isTestMode: false });
    await apiClient.setPrecinctSelection({
      precinctSelection: singlePrecinctSelectionFor('23'),
    });
    InsertedAuth.mockCardRemoval();

    mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
    await apiClient.printBallot({
      ballotStyleId: '1',
      precinctId: '23',
      languageCode: 'en',
      votes: { mayor: [{ id: 'sherlock-holmes', name: 'Sherlock Holmes' }] },
    });
    const printPath = mockPrinterHandler.getLastPrintPath()!;
    assert(typeof printPath === 'string');
    artifactPaths['bmd-ballot'] = printPath;
  });

  // configure at VxScan and scan the ballot
  await withScan(async ({ apiClient, mockPdiScanner }) => {
    await InsertedAuth.mockElectionManagerAuth(apiClient, election);
    mockUsbDrive.insert();
    (await apiClient.configureFromElectionPackageOnUsbDrive()).assertOk(
      'configuration failed'
    );
    await apiClient.setTestMode({ isTestMode: false });
    await apiClient.setPrecinctSelection({
      precinctSelection: singlePrecinctSelectionFor('23'),
    });
    InsertedAuth.mockCardRemoval();

    await InsertedAuth.mockPollWorkerAuth(apiClient, election);
    (await apiClient.openPolls()).assertOk('open polls failed');
    InsertedAuth.mockCardRemoval();

    await scanBallot(apiClient, mockPdiScanner, artifactPaths['bmd-ballot']!);

    await InsertedAuth.mockPollWorkerAuth(apiClient, election);
    await apiClient.closePolls();
    InsertedAuth.mockCardRemoval();
  });

  // load CVRs into VxAdmin and confirm that the vote shows up in the tally report
  await withAdmin(async ({ apiClient }) => {
    await DippedAuth.mockElectionManagerAuth(apiClient, election);

    mockUsbDrive.insert();
    const cvrFilesAvailable = await apiClient.listCastVoteRecordFilesOnUsb();
    expect(cvrFilesAvailable.length).toEqual(1);
    const cvrFile = cvrFilesAvailable[0];
    assert(cvrFile);
    (await apiClient.addCastVoteRecordFile({ path: cvrFile.path })).assertOk(
      'add cast vote record file failed'
    );

    const exportResult = await apiClient.exportTallyReportCsv({
      filter: {},
      groupBy: {},
      filename: 'tally-report.csv',
    });

    const path = exportResult.ok()![0];
    assert(typeof path === 'string');

    // read in the contents of the tally report csv
    const tallyReportCsv = readFileSync(path, 'utf8');
    expect(tallyReportCsv).toContain(
      'Mayor,mayor,Sherlock Holmes,sherlock-holmes,1\n'
    );
  });
}, 60_000);
