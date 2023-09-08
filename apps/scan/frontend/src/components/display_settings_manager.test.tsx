import { DefaultTheme, ThemeContext } from 'styled-components';
import React from 'react';
import {
  ThemeManagerContext,
  ThemeManagerContextInterface,
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
let themeManager: ThemeManagerContextInterface;
let scannerStatusQuery: ReturnType<typeof getScannerStatus.useQuery>;

function TestThemeInspector(): null {
  currentTheme = React.useContext(ThemeContext);
  themeManager = React.useContext(ThemeManagerContext);

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
        sizeMode: 'm',
      },
    }
  );

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastMedium',
      sizeMode: 'm',
    })
  );
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('Resets theme when election official logs in', async () => {
  // Simulate changing display settings as voter:
  act(() => {
    themeManager.setColorMode('contrastLow');
    themeManager.setSizeMode('xl');
  });

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'xl',
    })
  );

  // Should reset display settings on Election Manager login:
  act(() => apiMock.authenticateAsElectionManager(electionGeneralDefinition));
  await waitFor(() =>
    expect(currentTheme).toEqual(
      expect.objectContaining<Partial<DefaultTheme>>({
        colorMode: 'contrastMedium',
        sizeMode: 'm',
      })
    )
  );

  // Simulate changing display settings as Election Manager:
  act(() => {
    themeManager.setColorMode('contrastHighDark');
    themeManager.setSizeMode('s');
  });
  await waitFor(() =>
    expect(currentTheme).toEqual(
      expect.objectContaining<Partial<DefaultTheme>>({
        colorMode: 'contrastHighDark',
        sizeMode: 's',
      })
    )
  );

  // Should return to voter settings on logout:
  act(() => apiMock.removeCard());
  await waitFor(() =>
    expect(currentTheme).toEqual(
      expect.objectContaining<Partial<DefaultTheme>>({
        colorMode: 'contrastLow',
        sizeMode: 'xl',
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
        themeManager.setColorMode('contrastHighDark');
        themeManager.setSizeMode('xl');
      });
      expect(currentTheme).toEqual(
        expect.objectContaining<Partial<DefaultTheme>>({
          colorMode: 'contrastHighDark',
          sizeMode: 'xl',
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
              sizeMode: 'm',
            })
          )
        );
      } else {
        // Should be a no-op for all other scanner state changes:
        await waitFor(() =>
          expect(currentTheme).toEqual(
            expect.objectContaining<Partial<DefaultTheme>>({
              colorMode: 'contrastHighDark',
              sizeMode: 'xl',
            })
          )
        );
      }
    }
  }
});
