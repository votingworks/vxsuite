import { afterEach, beforeEach, expect, test } from 'vitest';
import {
  AdjudicationReason,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { assertDefined } from '@votingworks/basics';
import { render, screen, within } from '../test/react_testing_library';
import {
  MockApiClient,
  createMockApiClient,
  mockUserFeatures,
  provideApi,
  user,
} from '../test/api_helpers';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import { SystemSettingsScreen } from './system_settings_screen';
import { generalElectionRecord } from '../test/fixtures';

const electionRecord = generalElectionRecord(user.orgId);
const electionId = electionRecord.election.id;

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
  mockUserFeatures(apiMock, user);
  apiMock.getBallotTemplate
    .expectCallWith({ electionId })
    .resolves('VxDefaultBallot');
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen() {
  render(
    provideApi(
      apiMock,
      withRoute(<SystemSettingsScreen />, {
        paramPath: routes.election(':electionId').systemSettings.path,
        path: routes.election(electionId).systemSettings.path,
      })
    )
  );
}

test('feature flag to hide marginal mark thresholds', async () => {
  mockUserFeatures(apiMock, user, { MARGINAL_MARK_THRESHOLD: false });
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(electionRecord.systemSettings);
  renderScreen();
  await screen.findByRole('heading', { name: 'System Settings' });

  screen.getByRole('heading', { name: 'Scanner Thresholds' });

  expect(
    screen.queryByRole('spinbutton', {
      name: 'Marginal Mark Threshold',
    })
  ).not.toBeInTheDocument();
});

test('mark thresholds', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(electionRecord.systemSettings);
  renderScreen();
  await screen.findByRole('heading', { name: 'System Settings' });

  screen.getByRole('heading', { name: 'Scanner Thresholds' });

  const definiteInput = screen.getByRole('spinbutton', {
    name: 'Definite Mark Threshold',
  });
  expect(definiteInput).toBeDisabled();
  expect(definiteInput).toHaveValue(
    electionRecord.systemSettings.markThresholds.definite
  );

  const marginalInput = screen.getByRole('spinbutton', {
    name: 'Marginal Mark Threshold',
  });
  expect(marginalInput).toBeDisabled();
  expect(marginalInput).toHaveValue(
    electionRecord.systemSettings.markThresholds.marginal
  );

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  // change from 0.07 to 0.08
  userEvent.type(definiteInput, '{backspace}8');
  // change from 0.05 to 0.06
  userEvent.type(marginalInput, '{backspace}6');

  const updatedSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    markThresholds: {
      ...DEFAULT_SYSTEM_SETTINGS.markThresholds,
      definite: 0.08,
      marginal: 0.06,
    },
  };
  apiMock.updateSystemSettings
    .expectCallWith({ electionId, systemSettings: updatedSystemSettings })
    .resolves();
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(updatedSystemSettings);
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('button', { name: 'Edit' });

  expect(definiteInput).toHaveValue(
    updatedSystemSettings.markThresholds.definite
  );
  expect(definiteInput).toBeDisabled();
  expect(marginalInput).toHaveValue(
    updatedSystemSettings.markThresholds.marginal
  );
  expect(marginalInput).toBeDisabled();
});

test('minimum detected scale', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(electionRecord.systemSettings);
  renderScreen();
  await screen.findByRole('heading', { name: 'System Settings' });

  screen.getByRole('heading', { name: 'Scanner Thresholds' });

  const minimumDetectedScaleInput = screen.getByRole('spinbutton', {
    name: 'Minimum Detected Scale',
  });
  expect(minimumDetectedScaleInput).toBeDisabled();
  expect(minimumDetectedScaleInput).toHaveValue(0.985);

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  userEvent.type(minimumDetectedScaleInput, '{selectall}0.975');

  const updatedSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    minimumDetectedScale: 0.975,
  };
  apiMock.updateSystemSettings
    .expectCallWith({ electionId, systemSettings: updatedSystemSettings })
    .resolves();
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(updatedSystemSettings);
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('button', { name: 'Edit' });
});

test('adjudication reasons', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(electionRecord.systemSettings);
  renderScreen();
  await screen.findByRole('heading', { name: 'System Settings' });

  for (const option of screen.getAllByRole('checkbox')) {
    expect(option).toBeDisabled();
  }

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  screen.getByRole('heading', { name: 'Adjudication Reasons' });
  for (const machine of ['VxScan', 'VxCentralScan']) {
    const select = screen.getByRole('group', { name: machine });
    const options = within(select).getAllByRole('checkbox');
    expect(options).toHaveLength(4);
    for (const option of options) {
      expect(option).not.toBeChecked();
    }
    expect(options[0]).toHaveTextContent('Overvote');
    expect(options[1]).toHaveTextContent('Undervote');
    expect(options[2]).toHaveTextContent('Blank Ballot');
    expect(options[3]).toHaveTextContent('Unmarked Write-In');

    userEvent.click(options[0]);
    expect(options[0]).toBeChecked();
  }

  expect(
    screen.getByRole('checkbox', { name: 'Disallow Casting Overvotes' })
  ).not.toBeChecked();
  userEvent.click(
    screen.getByRole('checkbox', { name: 'Disallow Casting Overvotes' })
  );
  expect(
    screen.getByRole('checkbox', { name: 'Disallow Casting Overvotes' })
  ).toBeChecked();

  const updatedSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    precinctScanAdjudicationReasons: [AdjudicationReason.Overvote],
    centralScanAdjudicationReasons: [AdjudicationReason.Overvote],
    disallowCastingOvervotes: true,
  };
  apiMock.updateSystemSettings
    .expectCallWith({ electionId, systemSettings: updatedSystemSettings })
    .resolves();
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(updatedSystemSettings);
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('button', { name: 'Edit' });

  for (const option of screen.getAllByRole('checkbox')) {
    expect(option).toBeDisabled();
    if (
      option.textContent === 'Overvote' ||
      option.textContent === 'Disallow Casting Overvotes' ||
      option.textContent === 'Enable BMD Ballot Scanning on VxScan'
    ) {
      expect(option).toBeChecked();
    } else {
      expect(option).not.toBeChecked();
    }
  }
});

test('setting write-in text area threshold', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(electionRecord.systemSettings);
  renderScreen();
  await screen.findByRole('heading', { name: 'System Settings' });

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  expect(screen.queryByText('Write-In Area Threshold')).not.toBeInTheDocument();

  // VxCentralScan adjudication reason triggers the write-in area threshold input
  const centralScanContainer = screen.getByRole('group', {
    name: 'VxCentralScan',
  });
  userEvent.click(
    within(centralScanContainer).getByRole('checkbox', {
      name: 'Unmarked Write-In',
    })
  );
  await screen.findByText('Write-In Area Threshold');
  userEvent.click(
    within(centralScanContainer).getByRole('checkbox', {
      name: 'Unmarked Write-In',
    })
  );
  expect(screen.queryByText('Write-In Area Threshold')).not.toBeInTheDocument();

  // VxScan adjudication reason triggers the write-in area threshold input
  const scanContainer = screen.getByRole('group', { name: 'VxScan' });
  userEvent.click(
    within(scanContainer).getByRole('checkbox', {
      name: 'Unmarked Write-In',
    })
  );

  await screen.findByText('Write-In Area Threshold');
  const thresholdInput = screen.getByRole('spinbutton', {
    name: 'Write-In Area Threshold',
  });
  expect(thresholdInput).toHaveValue(
    electionRecord.systemSettings.markThresholds.writeInTextArea
  );

  // change from 0.05 to 0.08
  userEvent.type(thresholdInput, '{backspace}8');
  const updatedSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    markThresholds: {
      ...DEFAULT_SYSTEM_SETTINGS.markThresholds,
      writeInTextArea: 0.08,
    },
    precinctScanAdjudicationReasons: [AdjudicationReason.UnmarkedWriteIn],
  };
  apiMock.updateSystemSettings
    .expectCallWith({ electionId, systemSettings: updatedSystemSettings })
    .resolves();
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(updatedSystemSettings);
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('button', { name: 'Edit' });

  expect(thresholdInput).toHaveValue(
    updatedSystemSettings.markThresholds.writeInTextArea
  );
});

function expectComboBoxValue(
  container: HTMLElement,
  name: string,
  value: string
) {
  const selectElement = within(container).getByLabelText(name);
  expect(
    within(assertDefined(selectElement.parentElement)).getByText(value)
  ).toBeDefined();
}

async function expectSearchSelectValueThenEditValue(
  container: HTMLElement,
  elementName: string,
  initialValue: string,
  endingValue: string
) {
  expectComboBoxValue(container, elementName, initialValue);

  // Click SearchSelect
  userEvent.click(within(container).getByLabelText(elementName));

  // Wait for option to render and select it
  const targetChoice = await screen.findByText(endingValue);
  expect(targetChoice).toBeDefined();
  userEvent.click(targetChoice);

  expectComboBoxValue(container, elementName, endingValue);
}

function expectUncheckedThenCheck(container: HTMLElement, name: string) {
  const checkboxElement = within(container).getByRole('checkbox', {
    name,
  });
  expect(checkboxElement).not.toBeChecked();
  userEvent.click(checkboxElement);
  expect(checkboxElement).toBeChecked();
}

test('setting auth settings', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(electionRecord.systemSettings);
  const { systemSettings } = electionRecord;
  renderScreen();
  await screen.findByRole('heading', { name: 'System Settings' });

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  expect(screen.queryByText('Authentication')).toBeInTheDocument();
  const authHeading = screen.getByRole('heading', {
    name: 'Authentication',
  });
  expect(authHeading).toBeDefined();
  const authContainer = assertDefined(authHeading.parentElement);

  expectUncheckedThenCheck(authContainer, 'Enable Poll Worker PINs');

  await expectSearchSelectValueThenEditValue(
    authContainer,
    'Inactive Session Time Limit',
    `${systemSettings.auth.inactiveSessionTimeLimitMinutes} minutes`,
    '20 minutes'
  );

  await expectSearchSelectValueThenEditValue(
    authContainer,
    'Incorrect Pin Attempts Before Lockout',
    systemSettings.auth.numIncorrectPinAttemptsAllowedBeforeCardLockout.toString(),
    '10'
  );

  await expectSearchSelectValueThenEditValue(
    authContainer,
    'Starting Card Lockout Duration',
    `${systemSettings.auth.startingCardLockoutDurationSeconds.toString()} seconds`,
    '60 seconds'
  );

  const timeLimitInput = within(authContainer).getByRole('spinbutton', {
    name: 'Overall Session Time Limit (Hours)',
  });
  expect(timeLimitInput).toHaveValue(
    systemSettings.auth.overallSessionTimeLimitHours
  );
  userEvent.clear(timeLimitInput);
  userEvent.type(timeLimitInput, '11');
  const element = await within(authContainer).findByRole('spinbutton', {
    name: 'Overall Session Time Limit (Hours)',
  });
  expect(element).toHaveValue(11);

  const updatedSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    auth: {
      arePollWorkerCardPinsEnabled: true,
      inactiveSessionTimeLimitMinutes: 20,
      numIncorrectPinAttemptsAllowedBeforeCardLockout: 10,
      overallSessionTimeLimitHours: 11,
      startingCardLockoutDurationSeconds: 60,
    },
  };
  apiMock.updateSystemSettings
    .expectCallWith({ electionId, systemSettings: updatedSystemSettings })
    .resolves();
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(updatedSystemSettings);
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('button', { name: 'Edit' });

  expectComboBoxValue(
    authContainer,
    'Starting Card Lockout Duration',
    '60 seconds'
  );
});

test('setting "other" system settings', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(electionRecord.systemSettings);
  renderScreen();
  await screen.findByRole('heading', { name: 'System Settings' });

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  expect(screen.queryByText('Other')).toBeInTheDocument();
  const otherHeading = screen.getByRole('heading', {
    name: 'Other',
  });
  expect(otherHeading).toBeDefined();
  const otherContainer = assertDefined(otherHeading.parentElement);

  const checkboxLabels = [
    'Allow Official Ballots in Test Mode',
    'Disable Vertical Streak Detection',
    'Enable Shoeshine Mode on VxScan',
    'Include Redundant Metadata',
  ];

  for (const label of checkboxLabels) {
    expectUncheckedThenCheck(otherContainer, label);
  }

  const updatedSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    allowOfficialBallotsInTestMode: true,
    precinctScanEnableShoeshineMode: true,
    castVoteRecordsIncludeRedundantMetadata: true,
    disableVerticalStreakDetection: true,
  };
  apiMock.updateSystemSettings
    .expectCallWith({ electionId, systemSettings: updatedSystemSettings })
    .resolves();
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(updatedSystemSettings);
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('button', { name: 'Edit' });

  expect(
    within(otherContainer).getByRole('checkbox', {
      name: 'Allow Official Ballots in Test Mode',
    })
  ).toBeChecked();
});

test('cancelling', async () => {
  const { systemSettings } = electionRecord;
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(systemSettings);
  renderScreen();

  await screen.findByRole('heading', { name: 'System Settings' });
  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  expect(
    screen.getByRole('checkbox', {
      name: 'Allow Official Ballots in Test Mode',
    })
  ).not.toBeChecked();
  userEvent.click(
    screen.getByRole('checkbox', {
      name: 'Allow Official Ballots in Test Mode',
    })
  );
  expect(
    screen.getByRole('checkbox', {
      name: 'Allow Official Ballots in Test Mode',
    })
  ).toBeChecked();

  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  screen.getByRole('button', { name: 'Edit' });
  expect(
    screen.getByRole('checkbox', {
      name: 'Allow Official Ballots in Test Mode',
    })
  ).not.toBeChecked();
});

test('all controls are disabled until clicking "Edit"', async () => {
  mockUserFeatures(apiMock, user, { MARGINAL_MARK_THRESHOLD: true });
  const { systemSettings } = electionRecord;
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(systemSettings);
  renderScreen();

  await screen.findByRole('heading', { name: 'System Settings' });

  const allTextBoxes = document.body.querySelectorAll('input');

  for (const textbox of allTextBoxes) {
    expect(textbox.type).toMatch(/^text|number$/);
  }

  const allCheckboxes = document.body.querySelectorAll('[role=checkbox]');
  const allControls = [...allTextBoxes, ...allCheckboxes];

  expect(allControls).toHaveLength(23);

  for (const control of allControls) {
    expect(control).toBeDisabled();
  }

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  for (const control of allControls) {
    expect(control).not.toBeDisabled();
  }
});
