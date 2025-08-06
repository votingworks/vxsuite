import { describe, expect, test, vi } from 'vitest';
import { SignedHashValidationQrCodeValue } from '@votingworks/types';
import { generateSignedHashValidationQrCodeValue } from '@votingworks/auth';
import { electionSimpleSinglePrecinctFixtures } from '@votingworks/fixtures';
import { CITIZEN_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import { withApp } from '../test/app';
import {
  parseValidStreetsFromCsvString,
  parseVotersFromCsvString,
} from './pollbook_package';

const electionDefinition =
  electionSimpleSinglePrecinctFixtures.readElectionDefinition();
const townStreetNames = parseValidStreetsFromCsvString(
  electionSimpleSinglePrecinctFixtures.pollbookTownStreetNames.asText(),
  electionDefinition.election
);
const townVoters = parseVotersFromCsvString(
  electionSimpleSinglePrecinctFixtures.pollbookTownVoters.asText(),
  electionDefinition.election
);

vi.mock('@votingworks/auth', async (importActual) => ({
  ...(await importActual()),
  generateSignedHashValidationQrCodeValue: vi.fn(),
}));

describe('generateSignedHashValidationQrCodeValue', () => {
  test('pass', async () => {
    await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
      workspace.store.setElectionAndVoters(
        electionDefinition,
        'mock-package-hash',
        townStreetNames,
        townVoters
      );
      mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);
      expect(await localApiClient.haveElectionEventsOccurred()).toEqual(false);

      vi.mocked(generateSignedHashValidationQrCodeValue).mockResolvedValueOnce({
        qrCodeValue: 'qr code',
      } as unknown as SignedHashValidationQrCodeValue);

      const result =
        await localApiClient.generateSignedHashValidationQrCodeValue();
      expect(result).toEqual({ qrCodeValue: 'qr code' });
    });
  });

  test('fail', async () => {
    await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
      workspace.store.setElectionAndVoters(
        electionDefinition,
        'mock-package-hash',
        townStreetNames,
        townVoters
      );
      mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);
      expect(await localApiClient.haveElectionEventsOccurred()).toEqual(false);

      vi.mocked(generateSignedHashValidationQrCodeValue).mockRejectedValueOnce(
        new Error('oops')
      );

      await expect(
        localApiClient.generateSignedHashValidationQrCodeValue
      ).rejects.toThrow();
    });
  });
});
