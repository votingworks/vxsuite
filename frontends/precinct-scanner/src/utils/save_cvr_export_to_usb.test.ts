import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import fetchMock from 'fetch-mock';
import fileDownload from 'js-file-download';
import MockDate from 'mockdate';
import { fakeFileWriter } from '../../test/helpers/fake_file_writer';
import { MachineConfig } from '../config/types';

import { saveCvrExportToUsb } from './save_cvr_export_to_usb';

MockDate.set('2020-10-31T00:00:00.000Z');
jest.mock('js-file-download');

const machineConfig: MachineConfig = {
  machineId: '0003',
  codeVersion: 'TEST',
};

test('throws error when scan service errors', async () => {
  fetchMock.postOnce('/scan/export', {
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
    `"failed to generate scan export"`
  );
});

test('throws error when there is no usb mounted in kiosk mode', async () => {
  window.kiosk = fakeKiosk();
  fetchMock.postOnce(
    '/scan/export',
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
    '/scan/export',
    electionMinimalExhaustiveSampleFixtures.cvrData
  );
  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  const fileWriter = fakeFileWriter();
  mockKiosk.saveAs = jest.fn().mockResolvedValue(fileWriter);
  window.kiosk = mockKiosk;
  await saveCvrExportToUsb({
    electionDefinition:
      electionMinimalExhaustiveSampleFixtures.electionDefinition,
    machineConfig,
    scannedBallotCount: 0,
    isTestMode: false,
    openFilePickerDialog: true,
  });
  expect(window.kiosk.saveAs).toHaveBeenCalledWith({
    defaultPath:
      'fake mount point/cast-vote-records/sample-county_example-primary-election_0dabcacc5d/machine_0003__0_ballots__2020-10-31_00-00-00.jsonl',
  });
});

test('throws error when no file is chosen in file picker', async () => {
  fetchMock.postOnce(
    '/scan/export',
    electionMinimalExhaustiveSampleFixtures.cvrData
  );
  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = mockKiosk;
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
    `"could not save; no file was chosen"`
  );
});

test('saves file to default location when openFilePicker is false in kiosk mode', async () => {
  fetchMock.postOnce(
    '/scan/export',
    electionMinimalExhaustiveSampleFixtures.cvrData
  );
  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = mockKiosk;
  await saveCvrExportToUsb({
    electionDefinition:
      electionMinimalExhaustiveSampleFixtures.electionDefinition,
    machineConfig,
    scannedBallotCount: 0,
    isTestMode: false,
    openFilePickerDialog: false,
  });
  expect(window.kiosk.makeDirectory).toHaveBeenCalledWith(
    'fake mount point/cast-vote-records/sample-county_example-primary-election_0dabcacc5d',
    {
      recursive: true,
    }
  );
  expect(window.kiosk.writeFile).toHaveBeenCalledWith(
    'fake mount point/cast-vote-records/sample-county_example-primary-election_0dabcacc5d/machine_0003__0_ballots__2020-10-31_00-00-00.jsonl',
    electionMinimalExhaustiveSampleFixtures.cvrData
  );
});

test('calls fileDownload when not in kiosk mode', async () => {
  window.kiosk = undefined;
  fetchMock.postOnce(
    '/scan/export',
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
  expect(fileDownload).toHaveBeenCalledWith(
    electionMinimalExhaustiveSampleFixtures.cvrData,
    'machine_0003__0_ballots__2020-10-31_00-00-00.jsonl',
    'application/x-jsonlines'
  );
});
