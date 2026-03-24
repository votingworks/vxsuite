import { describe, expect, test, vi } from 'vitest';
import { SignedHashValidationQrCodeValue } from '@votingworks/types';
import { electionSimpleSinglePrecinctFixtures } from '@votingworks/fixtures';
import { CITIZEN_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import { withApp } from '../test/app.js';
import {
  parseValidStreetsFromCsvString,
  parseVotersFromCsvString,
} from './pollbook_package.js';

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

describe('generateSignedHashValidationQrCodeValue', () => {
  test('pass', async () => {
    const mockGenerateSignedHashValidationQrCodeValue = vi
      .fn()
      .mockResolvedValueOnce({
        qrCodeValue: 'qr code',
      } as unknown as SignedHashValidationQrCodeValue);

    await withApp(
      async ({ localApiClient, workspace, mockPrinterHandler }) => {
        workspace.store.setElectionAndVoters(
          electionDefinition,
          'mock-package-hash',
          townStreetNames,
          townVoters
        );
        mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);
        expect(await localApiClient.haveElectionEventsOccurred()).toEqual(
          false
        );

        const result =
          await localApiClient.generateSignedHashValidationQrCodeValue();
        expect(result).toEqual({ qrCodeValue: 'qr code' });
      },
      {
        generateSignedHashValidationQrCodeValueOverride:
          mockGenerateSignedHashValidationQrCodeValue,
      }
    );
  });

  test('fail', async () => {
    const mockGenerateSignedHashValidationQrCodeValue = vi
      .fn()
      .mockRejectedValueOnce(new Error('oops'));

    await withApp(
      async ({ localApiClient, workspace, mockPrinterHandler }) => {
        workspace.store.setElectionAndVoters(
          electionDefinition,
          'mock-package-hash',
          townStreetNames,
          townVoters
        );
        mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);
        expect(await localApiClient.haveElectionEventsOccurred()).toEqual(
          false
        );

        await expect(
          localApiClient.generateSignedHashValidationQrCodeValue
        ).rejects.toThrow();
      },
      {
        generateSignedHashValidationQrCodeValueOverride:
          mockGenerateSignedHashValidationQrCodeValue,
      }
    );
  });
});
