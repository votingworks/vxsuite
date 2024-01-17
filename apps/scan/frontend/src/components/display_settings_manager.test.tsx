import { DefaultTheme, ThemeContext } from 'styled-components';
import React from 'react';
import {
  DisplaySettingsManagerContext,
  DisplaySettingsManagerContextInterface,
} from '@votingworks/ui';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { advanceTimersAndPromises } from '@votingworks/test-utils';
import { PRECINCT_SCANNER_STATES } from '@votingworks/types';
import { act, render, waitFor } from '../../test/react_testing_library';
import { DisplaySettingsManager } from './display_settings_manager';
import {
  ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';
import { getScannerStatus } from '../api';
import { scannerStatus } from '../../test/helpers/helpers';

let apiMock: ApiMock;
let currentTheme: DefaultTheme;
let displaySettingsManager: DisplaySettingsManagerContextInterface;
let scannerStatusQuery: ReturnType<typeof getScannerStatus.useQuery>;

function TestThemeInspector(): null {
  currentTheme = React.useContext(ThemeContext);
  displaySettingsManager = React.useContext(DisplaySettingsManagerContext);

  scannerStatusQuery = getScannerStatus.useQuery();

  return null;
}

beforeEach(() => {
  jest.useFakeTimers();
  apiMock = createApiMock();
  apiMock.removeCard();
  apiMock.expectGetScannerStatus(statusNoPaper);

  render(
    provideApi(
      apiMock,
      <div>
        <DisplaySettingsManager />
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
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('Resets theme when election official logs in', async () => {
  // Simulate changing display settings as voter:
  act(() => {
    displaySettingsManager.setColorMode('contrastLow');
    displaySettingsManager.setSizeMode('touchExtraLarge');
  });

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchExtraLarge',
    })
  );

  // Should reset display settings on Election Manager login:
  act(() => apiMock.authenticateAsElectionManager(electionGeneralDefinition));
  await waitFor(() =>
    expect(currentTheme).toEqual(
      expect.objectContaining<Partial<DefaultTheme>>({
        colorMode: 'contrastMedium',
        sizeMode: 'touchMedium',
      })
    )
  );

  // Simulate changing display settings as Election Manager:
  act(() => {
    displaySettingsManager.setColorMode('contrastHighDark');
    displaySettingsManager.setSizeMode('touchSmall');
  });
  await waitFor(() =>
    expect(currentTheme).toEqual(
      expect.objectContaining<Partial<DefaultTheme>>({
        colorMode: 'contrastHighDark',
        sizeMode: 'touchSmall',
      })
    )
  );

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
});

test('Resets theme after successful scan', async () => {
  for (const oldState of PRECINCT_SCANNER_STATES) {
    for (const newState of PRECINCT_SCANNER_STATES) {
      // Set up initial scanner state:
      apiMock.expectGetScannerStatus(scannerStatus({ state: oldState }));
      await scannerStatusQuery.refetch();
      await advanceTimersAndPromises();

      // Simulate initial voter display settings:
      act(() => {
        displaySettingsManager.setColorMode('contrastHighDark');
        displaySettingsManager.setSizeMode('touchExtraLarge');
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

      if (oldState !== 'no_paper' && newState === 'no_paper') {
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
