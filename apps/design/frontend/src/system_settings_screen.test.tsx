import { afterEach, beforeEach, describe, expect, test } from 'vitest';
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
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.getBaseUrl.expectCallWith().resolves('http://test-results-url.com');
  mockUserFeatures(apiMock);
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

test('mark thresholds', async () => {
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
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(electionRecord.systemSettings);
  renderScreen();
  await screen.findByRole('heading', { name: 'System Settings' });

  screen.getByRole('heading', { name: 'Scanner Thresholds' });

  const minimumDetectedBallotScaleOverrideInput = screen.getByRole(
    'spinbutton',
    {
      name: 'Minimum Detected Ballot Scale Override',
    }
  );
  expect(minimumDetectedBallotScaleOverrideInput).toBeDisabled();
  expect(minimumDetectedBallotScaleOverrideInput).toHaveValue(null);

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  userEvent.type(minimumDetectedBallotScaleOverrideInput, '{selectall}0.995');

  const updatedSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    minimumDetectedBallotScaleOverride: 0.995,
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

  const admin = screen.getByRole('group', { name: 'VxAdmin' });
  const options = within(admin).getAllByRole('checkbox');
  expect(options).toHaveLength(3);
  for (const option of options) {
    expect(option).not.toBeChecked();
  }
  expect(options[0]).toHaveTextContent('Overvote');
  expect(options[1]).toHaveTextContent('Undervote');
  expect(options[2]).toHaveTextContent('Marginal Mark');

  userEvent.click(options[0]);
  expect(options[0]).toBeChecked();

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
    adminAdjudicationReasons: [AdjudicationReason.Overvote],
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
  const { systemSettings } = electionRecord;
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

  expect(allControls).toHaveLength(28);

  for (const control of allControls) {
    expect(control).toBeDisabled();
  }

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  for (const control of allControls) {
    expect(control).not.toBeDisabled();
  }
});

describe('BMD overvote toggle', () => {
  test('omitted when feature flag is off', async () => {
    apiMock.getSystemSettings
      .expectCallWith({ electionId })
      .resolves(electionRecord.systemSettings);

    mockUserFeatures(apiMock, { BMD_OVERVOTE_ALLOW_TOGGLE: false });

    renderScreen();

    await screen.findByRole('heading', { name: 'System Settings' });
    expect(
      screen.queryByText(/allow overvote marking/i)
    ).not.toBeInTheDocument();
  });

  test('included when feature flag is on', async () => {
    const mockSettingsInitial: SystemSettings = {
      ...electionRecord.systemSettings,
      bmdAllowOvervotes: true,
    };

    apiMock.getSystemSettings
      .expectCallWith({ electionId })
      .resolves(mockSettingsInitial);

    mockUserFeatures(apiMock, { BMD_OVERVOTE_ALLOW_TOGGLE: true });

    renderScreen();

    await screen.findByRole('heading', { name: 'System Settings' });
    screen.getByText(/allow overvote marking/i);

    userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    userEvent.click(
      screen.getByRole('checkbox', {
        name: /allow overvote marking/i,
        checked: true,
      })
    );

    const mockSettingsFinal: SystemSettings = {
      ...mockSettingsInitial,
      bmdAllowOvervotes: undefined,
    };
    apiMock.updateSystemSettings
      .expectCallWith({ electionId, systemSettings: mockSettingsFinal })
      .resolves();

    apiMock.getSystemSettings
      .expectCallWith({ electionId })
      .resolves(mockSettingsFinal);

    userEvent.click(screen.getByRole('button', { name: 'Save' }));
  });
});

describe('BMD print mode', () => {
  test('omitted when feature flag is off', async () => {
    mockUserFeatures(apiMock, { BMD_EXTRA_PRINT_MODES: false });

    apiMock.getSystemSettings
      .expectCallWith({ electionId })
      .resolves(electionRecord.systemSettings);

    renderScreen();

    await screen.findByRole('heading', { name: 'System Settings' });
    expect(screen.queryByText('VxMark Print Mode')).not.toBeInTheDocument();
  });

  test('included when feature flag is on', async () => {
    mockUserFeatures(apiMock, { BMD_EXTRA_PRINT_MODES: true });

    const mockSettingsInitial: SystemSettings = {
      ...electionRecord.systemSettings,
      bmdPrintMode: 'marks_on_preprinted_ballot',
    };

    apiMock.getSystemSettings
      .expectCallWith({ electionId })
      .resolves(mockSettingsInitial);

    renderScreen();
    await screen.findByText('VxMark Print Mode');

    userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const section = assertDefined(
      screen.getByRole('heading', { name: 'Other' }).parentElement
    );
    await expectSearchSelectValueThenEditValue(
      section,
      'VxMark Print Mode',
      `Marks on Preprinted Ballots`,
      `Full Ballot Prints`
    );

    const mockSettingsFinal: SystemSettings = {
      ...mockSettingsInitial,
      bmdPrintMode: 'bubble_ballot',
    };
    apiMock.updateSystemSettings
      .expectCallWith({ electionId, systemSettings: mockSettingsFinal })
      .resolves();
    apiMock.getSystemSettings
      .expectCallWith({ electionId })
      .resolves(mockSettingsFinal);

    userEvent.click(screen.getByRole('button', { name: 'Save' }));
  });

  test('omits default value from saved settings', async () => {
    mockUserFeatures(apiMock, { BMD_EXTRA_PRINT_MODES: true });

    const mockSettingsInitial: SystemSettings = {
      ...electionRecord.systemSettings,
      bmdPrintMode: 'bubble_ballot',
    };

    apiMock.getSystemSettings
      .expectCallWith({ electionId })
      .resolves(mockSettingsInitial);

    renderScreen();
    await screen.findByText('VxMark Print Mode');

    userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const section = assertDefined(
      screen.getByRole('heading', { name: 'Other' }).parentElement
    );
    await expectSearchSelectValueThenEditValue(
      section,
      'VxMark Print Mode',
      `Full Ballot Prints`,
      `QR Code Summary Ballots`
    );

    const mockSettingsFinal: SystemSettings = {
      ...mockSettingsInitial,
      bmdPrintMode: undefined,
    };
    apiMock.updateSystemSettings
      .expectCallWith({ electionId, systemSettings: mockSettingsFinal })
      .resolves();
    apiMock.getSystemSettings
      .expectCallWith({ electionId })
      .resolves(mockSettingsFinal);

    userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expectComboBoxValue(
      section,
      'VxMark Print Mode',
      `QR Code Summary Ballots`
    );
  });
});

describe('Quick Results Reporting SS', () => {
  test('omitted when feature flag is off', async () => {
    apiMock.getSystemSettings
      .expectCallWith({ electionId })
      .resolves(electionRecord.systemSettings);

    mockUserFeatures(apiMock, { QUICK_RESULTS_REPORTING: false });

    renderScreen();

    await screen.findByRole('heading', { name: 'System Settings' });
    expect(
      screen.queryByText(/Configure Quick Results Reporting/i)
    ).not.toBeInTheDocument();
  });

  test('included when feature flag is on', async () => {
    const mockSettingsInitial: SystemSettings = {
      ...electionRecord.systemSettings,
      quickResultsReportingUrl: '',
    };

    apiMock.getSystemSettings
      .expectCallWith({ electionId })
      .resolves(mockSettingsInitial);

    mockUserFeatures(apiMock, { QUICK_RESULTS_REPORTING: true });

    renderScreen();

    await screen.findByRole('heading', { name: 'System Settings' });
    screen.getByText(/Configure Quick Results Reporting/i);

    userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    userEvent.click(
      screen.getByRole('checkbox', {
        name: 'Quick Results Reporting',
        checked: false,
      })
    );

    const mockSettingsFinal: SystemSettings = {
      ...mockSettingsInitial,
      quickResultsReportingUrl: 'http://test-results-url.com/report',
    };
    apiMock.updateSystemSettings
      .expectCallWith({ electionId, systemSettings: mockSettingsFinal })
      .resolves();

    apiMock.getSystemSettings
      .expectCallWith({ electionId })
      .resolves(mockSettingsFinal);

    userEvent.click(screen.getByRole('button', { name: 'Save' }));
  });
});
