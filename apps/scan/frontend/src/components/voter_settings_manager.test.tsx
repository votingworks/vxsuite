import { DefaultTheme, ThemeContext } from 'styled-components';
import React from 'react';
import {
  LanguageControls,
  VoterSettingsManagerContext,
  VoterSettingsManagerContextInterface,
  useCurrentLanguage,
} from '@votingworks/ui';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { advanceTimersAndPromises, mockOf } from '@votingworks/test-utils';
import { LanguageCode, PRECINCT_SCANNER_STATES } from '@votingworks/types';
import { act, render, waitFor } from '../../test/react_testing_library';
import { VoterSettingsManager } from './voter_settings_manager';
import {
  ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';
import { getPollsInfo, getScannerStatus } from '../api';
import { scannerStatus } from '../../test/helpers/helpers';

let apiMock: ApiMock;
let currentTheme: DefaultTheme;
let voterSettingsManager: VoterSettingsManagerContextInterface;
let scannerStatusQuery: ReturnType<typeof getScannerStatus.useQuery>;
let pollsInfoQuery: ReturnType<typeof getPollsInfo.useQuery>;
let currentLanguage: LanguageCode;

function TestThemeInspector(): null {
  currentTheme = React.useContext(ThemeContext);
  voterSettingsManager = React.useContext(VoterSettingsManagerContext);
  currentLanguage = useCurrentLanguage();

  scannerStatusQuery = getScannerStatus.useQuery();
  pollsInfoQuery = getPollsInfo.useQuery();

  return null;
}

const mockLanguageControls: jest.Mocked<LanguageControls> = {
  reset: jest.fn(),
  setLanguage: jest.fn(),
};

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => ({
  ...jest.requireActual('@votingworks/ui'),
  useCurrentLanguage: jest.fn(),
  useLanguageControls: () => mockLanguageControls,
}));

const mockUseCurrentLanguage = mockOf(useCurrentLanguage);

beforeEach(() => {
  jest.useFakeTimers();
  apiMock = createApiMock();
  apiMock.removeCard();
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.expectGetPollsInfo('polls_open');
  mockUseCurrentLanguage.mockReturnValue(LanguageCode.ENGLISH);

  render(
    provideApi(
      apiMock,
      <div>
        <VoterSettingsManager />
        <TestThemeInspector />
      </div>
    ),
    {
      vxTheme: {
        colorMode: 'contrastMedium',
        sizeMode: 'touchMedium',
      },
    }
  );
  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastMedium',
      sizeMode: 'touchMedium',
    })
  );
  expect(currentLanguage).toEqual('en');
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('Resets theme when election official logs in', async () => {
  // Simulate changing voter settings as voter:
  act(() => {
    mockUseCurrentLanguage.mockReturnValue(LanguageCode.SPANISH);
    voterSettingsManager.setColorMode('contrastLow');
    voterSettingsManager.setSizeMode('touchExtraLarge');
  });

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchExtraLarge',
    })
  );
  expect(currentLanguage).toEqual(LanguageCode.SPANISH);

  // Should reset voter settings on Election Manager login:
  act(() => apiMock.authenticateAsElectionManager(electionGeneralDefinition));
  await waitFor(() =>
    expect(currentTheme).toEqual(
      expect.objectContaining<Partial<DefaultTheme>>({
        colorMode: 'contrastMedium',
        sizeMode: 'touchMedium',
      })
    )
  );
  expect(mockLanguageControls.reset).toHaveBeenCalled();

  // Simulate changing voter settings as Election Manager:
  act(() => {
    voterSettingsManager.setColorMode('contrastHighDark');
    voterSettingsManager.setSizeMode('touchSmall');
    mockUseCurrentLanguage.mockReturnValue(LanguageCode.CHINESE_SIMPLIFIED);
  });
  await waitFor(() =>
    expect(currentTheme).toEqual(
      expect.objectContaining<Partial<DefaultTheme>>({
        colorMode: 'contrastHighDark',
        sizeMode: 'touchSmall',
      })
    )
  );
  expect(currentLanguage).toEqual(LanguageCode.CHINESE_SIMPLIFIED);

  // Should return to voter settings on logout:
  act(() => apiMock.removeCard());
  await waitFor(() =>
    expect(currentTheme).toEqual(
      expect.objectContaining<Partial<DefaultTheme>>({
        colorMode: 'contrastLow',
        sizeMode: 'touchExtraLarge',
      })
    )
  );
  expect(mockLanguageControls.setLanguage).toHaveBeenCalledWith(
    LanguageCode.SPANISH
  );
});

test('Resets theme after successful scan', async () => {
  for (const oldState of PRECINCT_SCANNER_STATES) {
    for (const newState of PRECINCT_SCANNER_STATES) {
      // Set up initial scanner state:
      apiMock.expectGetScannerStatus(scannerStatus({ state: oldState }));
      await scannerStatusQuery.refetch();
      await advanceTimersAndPromises();

      // Simulate initial voter voter settings:
      act(() => {
        voterSettingsManager.setColorMode('contrastHighDark');
        voterSettingsManager.setSizeMode('touchExtraLarge');
      });
      expect(currentTheme).toEqual(
        expect.objectContaining<Partial<DefaultTheme>>({
          colorMode: 'contrastHighDark',
          sizeMode: 'touchExtraLarge',
        })
      );

      // Simulate scanner state change:
      apiMock.expectGetScannerStatus(scannerStatus({ state: newState }));
      await scannerStatusQuery.refetch();
      await advanceTimersAndPromises();

      if (
        oldState !== 'no_paper' &&
        oldState !== 'paused' &&
        newState === 'no_paper'
      ) {
        // Should reset theme when sheet leaves the scanner:
        await waitFor(() =>
          expect(currentTheme).toEqual(
            expect.objectContaining<Partial<DefaultTheme>>({
              colorMode: 'contrastMedium',
              sizeMode: 'touchMedium',
            })
          )
        );
      } else {
        // Should be a no-op for all other scanner state changes:
        await waitFor(() =>
          expect(currentTheme).toEqual(
            expect.objectContaining<Partial<DefaultTheme>>({
              colorMode: 'contrastHighDark',
              sizeMode: 'touchExtraLarge',
            })
          )
        );
      }
    }
  }
});

test('Resets theme after polls close', async () => {
  // Simulate changing voter settings as voter
  act(() => {
    mockUseCurrentLanguage.mockReturnValue(LanguageCode.SPANISH);
    voterSettingsManager.setColorMode('contrastLow');
    voterSettingsManager.setSizeMode('touchExtraLarge');
  });

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchExtraLarge',
    })
  );
  expect(currentLanguage).toEqual(LanguageCode.SPANISH);

  // Simulate polls closing
  apiMock.expectGetPollsInfo('polls_closed_final');
  await pollsInfoQuery.refetch();

  // Should reset voter settings when polls close
  await waitFor(() =>
    expect(currentTheme).toEqual(
      expect.objectContaining<Partial<DefaultTheme>>({
        colorMode: 'contrastMedium',
        sizeMode: 'touchMedium',
      })
    )
  );
  expect(mockLanguageControls.reset).toHaveBeenCalled();
});
