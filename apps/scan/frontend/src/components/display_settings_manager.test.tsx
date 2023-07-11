import { DefaultTheme, ThemeContext } from 'styled-components';
import React from 'react';
import {
  ThemeManagerContext,
  ThemeManagerContextInterface,
} from '@votingworks/ui';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { PRECINCT_SCANNER_STATES } from '@votingworks/scan-backend';
import { advanceTimersAndPromises } from '@votingworks/test-utils';
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
  act(() => apiMock.authenticateAsElectionManager(electionSampleDefinition));
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
  // Simulate changing display settings as voter:
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

  // Should be a no-op if scanner status change doesn't represent session end:
  for (const oldState of PRECINCT_SCANNER_STATES) {
    apiMock.expectGetScannerStatus(scannerStatus({ state: oldState }));
    await scannerStatusQuery.refetch();
    await advanceTimersAndPromises();

    for (const newState of PRECINCT_SCANNER_STATES) {
      if (oldState === 'accepted' && newState === 'no_paper') {
        continue;
      }

      apiMock.expectGetScannerStatus(scannerStatus({ state: newState }));
      await scannerStatusQuery.refetch();
      await advanceTimersAndPromises();

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

  // Should reset theme after successful scan:
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'accepted' }));
  await scannerStatusQuery.refetch();
  await advanceTimersAndPromises();

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'no_paper' }));
  await scannerStatusQuery.refetch();
  await advanceTimersAndPromises();

  await waitFor(() =>
    expect(currentTheme).toEqual(
      expect.objectContaining<Partial<DefaultTheme>>({
        colorMode: 'contrastMedium',
        sizeMode: 'm',
      })
    )
  );
});
