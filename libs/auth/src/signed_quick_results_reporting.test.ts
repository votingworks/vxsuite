import { expect, test, vi } from 'vitest';
import { electionGeneralFixtures } from '@votingworks/fixtures';
import { DEV_MACHINE_ID, Tabulation } from '@votingworks/types';
import { compressTally } from '@votingworks/utils';

import { getTestFile } from '../test/utils';
import { SignedQuickResultsReportingConfig } from './config';
import { generateSignedQuickResultsReportingUrl } from './signed_quick_results_reporting';

vi.mock(
  '@votingworks/utils',
  async (importActual): Promise<typeof import('@votingworks/utils')> => ({
    ...(await importActual<typeof import('@votingworks/utils')>()),
    compressTally: vi.fn<typeof compressTally>().mockReturnValue([]),
  })
);

const vxScanTestConfig: SignedQuickResultsReportingConfig = {
  machinePrivateKey: getTestFile({ fileType: 'vx-scan-private-key.pem' }),
};

const electionDefinition = electionGeneralFixtures.readElectionDefinition();
const mockedResults = {} as unknown as Tabulation.ElectionResults;

test.each<{ isLiveMode: boolean }>([
  { isLiveMode: false },
  { isLiveMode: true },
])(
  'Generating signed quick results reporting URL, isLiveMode = $isLiveMode',
  async ({ isLiveMode }) => {
    const signedQuickResultsReportingUrl =
      await generateSignedQuickResultsReportingUrl(
        {
          electionDefinition,
          isLiveMode,
          quickResultsReportingUrl: 'https://example.com',
          results: mockedResults,
          signingMachineId: DEV_MACHINE_ID,
        },
        vxScanTestConfig
      );

    expect(compressTally).toHaveBeenCalledTimes(1);
    expect(signedQuickResultsReportingUrl).toMatch(
      /^https:\/\/example.com\/\?p=.*&s=[A-Za-z0-9-_]+$/
    );
  }
);
