import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import fetchMock from 'fetch-mock';
import MockDate from 'mockdate';
import { fakeFileWriter } from '../../test/helpers/fake_file_writer';
import { MachineConfig } from '../config/types';

import { saveCvrExportToUsb } from './save_cvr_export_to_usb';

MockDate.set('2020-10-31T00:00:00.000Z');

const machineConfig: MachineConfig = {
  machineId: '0003',
  codeVersion: 'TEST',
};

let kiosk = fakeKiosk();

beforeEach(() => {
  kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  kiosk.writeFile.mockResolvedValue(
    fakeFileWriter() as unknown as ReturnType<KioskBrowser.Kiosk['writeFile']>
  );
  kiosk.saveAs.mockResolvedValue(fakeFileWriter());
  window.kiosk = kiosk;
});

afterEach(() => {
  delete window.kiosk;
});

test('throws error when scan service errors', async () => {
  fetchMock.postOnce('/precinct-scanner/export', {
    status: 500,
    body: { status: 'error' },
  });
  await expect(
    saveCvrExportToUsb({
      electionDefinition:
        electionMinimalExhaustiveSampleFixtures.electionDefinition,
      machineConfig,
      scannedBallotCount: 0,
      isTestMode: false,
      openFilePickerDialog: false,
    })
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `"Unable to get CVR file: FetchFailed (status=Internal Server Error)"`
  );
});

test('throws error when there is no usb mounted in kiosk mode', async () => {
  kiosk.getUsbDrives.mockResolvedValue([]);
  fetchMock.postOnce(
    '/precinct-scanner/export',
    electionMinimalExhaustiveSampleFixtures.cvrData
  );
  await expect(
    saveCvrExportToUsb({
      electionDefinition:
        electionMinimalExhaustiveSampleFixtures.electionDefinition,
      machineConfig,
      scannedBallotCount: 0,
      isTestMode: false,
      openFilePickerDialog: false,
    })
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `"could not save file; path to usb drive missing"`
  );
});

test('calls kiosk saveAs when opening file picker dialog', async () => {
  fetchMock.postOnce(
    '/precinct-scanner/export',
    electionMinimalExhaustiveSampleFixtures.cvrData
  );
  await saveCvrExportToUsb({
    electionDefinition:
      electionMinimalExhaustiveSampleFixtures.electionDefinition,
    machineConfig,
    scannedBallotCount: 0,
    isTestMode: false,
    openFilePickerDialog: true,
  });
  expect(kiosk.saveAs).toHaveBeenCalledWith({
    defaultPath: 'machine_0003__0_ballots__2020-10-31_00-00-00.jsonl',
  });
});

test('throws error when no file is chosen in file picker', async () => {
  fetchMock.postOnce(
    '/precinct-scanner/export',
    electionMinimalExhaustiveSampleFixtures.cvrData
  );
  kiosk.saveAs.mockResolvedValue(undefined);
  await expect(
    saveCvrExportToUsb({
      electionDefinition:
        electionMinimalExhaustiveSampleFixtures.electionDefinition,
      machineConfig,
      scannedBallotCount: 0,
      isTestMode: false,
      openFilePickerDialog: true,
    })
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `"Could not save; no file was chosen"`
  );
});

test('saves file to default location when openFilePicker is false in kiosk mode', async () => {
  fetchMock.postOnce(
    '/precinct-scanner/export',
    electionMinimalExhaustiveSampleFixtures.cvrData
  );
  await saveCvrExportToUsb({
    electionDefinition:
      electionMinimalExhaustiveSampleFixtures.electionDefinition,
    machineConfig,
    scannedBallotCount: 0,
    isTestMode: false,
    openFilePickerDialog: false,
  });
  expect(kiosk.makeDirectory).toHaveBeenCalledWith(
    'fake mount point/cast-vote-records/sample-county_example-primary-election_0dabcacc5d',
    {
      recursive: true,
    }
  );
  expect(kiosk.writeFile).toHaveBeenCalledWith(
    'fake mount point/cast-vote-records/sample-county_example-primary-election_0dabcacc5d/machine_0003__0_ballots__2020-10-31_00-00-00.jsonl'
  );
});
