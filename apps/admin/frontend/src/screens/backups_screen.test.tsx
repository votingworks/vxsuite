import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth } from '@votingworks/types';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';
import { screen } from '../../test/react_testing_library.js';

import { renderInAppContext } from '../../test/render_in_app_context.js';
import { BackupsScreen } from './backups_screen.js';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client.js';

const featureFlagMock = vi.hoisted(() => {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  const { getFeatureFlagMock } = require('@votingworks/utils');
  return getFeatureFlagMock();
});
vi.mock('@votingworks/utils', async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

const auth: DippedSmartCardAuth.SystemAdministratorLoggedIn = {
  status: 'logged_in',
  user: mockSystemAdministratorUser(),
  sessionExpiresAt: mockSessionExpiresAt(),
  programmableCard: { status: 'no_card' },
};

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
  apiMock.assertComplete();
});

test('Backups sidebar entry is hidden when the feature flag is off', () => {
  renderInAppContext(<BackupsScreen />, { apiMock, auth });

  expect(
    screen.queryByRole('button', { name: 'Backups' })
  ).not.toBeInTheDocument();
});

test('Backups sidebar entry and TODO content render when the feature flag is on', () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_ADMIN_BACKUP_RESTORE
  );

  renderInAppContext(<BackupsScreen />, { apiMock, auth });

  screen.getByRole('button', { name: 'Backups' });
  screen.getByRole('heading', { name: 'Backups' });
  screen.getByText('TODO: backup and restore UI');
});
