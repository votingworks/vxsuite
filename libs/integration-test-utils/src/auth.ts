import type { Page } from '@playwright/test';
import {
  INTEGRATION_TEST_DEFAULT_PIN,
  mockCardRemoval,
  mockElectionManagerCardInsertion,
  mockPollWorkerCardInsertion,
  mockSystemAdministratorCardInsertion,
} from '@votingworks/auth';
import { methodUrl } from '@votingworks/grout';
import type { Election } from '@votingworks/types';
import { BASE_URL } from './constants';

const API_URL = `${BASE_URL}/api`;

async function postToApi(page: Page, method: string): Promise<void> {
  const response = await page.request.post(methodUrl(method, API_URL), {
    data: '{}',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok()) {
    throw new Error(
      `POST ${method} failed: ${response.status()} ${await response.text()}`
    );
  }
}

/**
 * Configuration for {@link buildInsertedSmartCardAuthHelpers}. Inserted
 * smart-card auth (VxMark, VxScan, VxMarkScan) keeps the card inserted while the
 * user is logged in.
 */
export interface InsertedSmartCardAuthConfig {
  /** App name as it appears in the configure-card prompt, e.g. `'VxMark'`. */
  appName: string;
  /**
   * How the PIN-pad digits are rendered. VxMarkScan renders them as plain text;
   * the others render them as buttons.
   */
  pinDigitSelector?: 'button' | 'text';
  /**
   * Whether `forceLogOutAndResetElectionDefinition` should first end a lingering
   * cardless voter session. VxMark and VxMarkScan need this; see the workaround
   * note on the internal `endCardlessVoterSession`.
   */
  endsCardlessVoterSession?: boolean;
}

export interface InsertedSmartCardAuthHelpers {
  enterPin(page: Page): Promise<void>;
  logInAsSystemAdministrator(page: Page): Promise<void>;
  logInAsElectionManager(page: Page, election: Election): Promise<void>;
  logInAsPollWorker(election: Election): void;
  forceLogOutAndResetElectionDefinition(page: Page): Promise<void>;
}

/**
 * Builds Playwright auth helpers for an app that uses inserted smart-card auth
 * (the card stays inserted while logged in): VxMark, VxScan, VxMarkScan.
 */
export function buildInsertedSmartCardAuthHelpers(
  config: InsertedSmartCardAuthConfig
): InsertedSmartCardAuthHelpers {
  const {
    appName,
    pinDigitSelector = 'button',
    endsCardlessVoterSession: endsSession = false,
  } = config;

  async function enterPin(page: Page): Promise<void> {
    await page.getByText('Enter Card PIN').waitFor();
    for (const digit of INTEGRATION_TEST_DEFAULT_PIN) {
      const locator =
        pinDigitSelector === 'text'
          ? page.getByText(digit)
          : page.getByRole('button', { name: digit });
      await locator.click();
    }
  }

  async function logInAsSystemAdministrator(page: Page): Promise<void> {
    mockSystemAdministratorCardInsertion();
    await enterPin(page);
    await page.getByText('System Administrator Menu').waitFor();
  }

  async function logInAsElectionManager(
    page: Page,
    election: Election
  ): Promise<void> {
    mockElectionManagerCardInsertion({ election });
    await enterPin(page);
  }

  function logInAsPollWorker(election: Election): void {
    mockPollWorkerCardInsertion({ election });
  }

  async function forceLogOut(page: Page): Promise<void> {
    await postToApi(page, 'logOut');
  }

  /**
   * Ends any active cardless voter session, bypassing the UI. Needed before
   * unconfiguring: a session left active when the machine is unconfigured (and
   * later reconfigured with a different election) references a now-missing
   * ballot style and crashes the app on boot. Workaround for
   * https://github.com/votingworks/vxsuite/issues/8553 — remove once fixed.
   */
  async function endCardlessVoterSession(page: Page): Promise<void> {
    await postToApi(page, 'endCardlessVoterSession');
  }

  async function forceLogOutAndResetElectionDefinition(
    page: Page
  ): Promise<void> {
    if (endsSession) {
      await endCardlessVoterSession(page);
    }
    await forceLogOut(page);
    await page.goto('/');
    mockCardRemoval();
    // Wait for the frontend to render something before inserting the SA card, so
    // the auth state machine is ready to process it.
    await page.waitForLoadState('domcontentloaded');

    await logInAsSystemAdministrator(page);

    const unconfigureMachineButton = page.getByRole('button', {
      name: 'Unconfigure Machine',
    });

    if (
      (await unconfigureMachineButton.isVisible()) &&
      (await unconfigureMachineButton.isEnabled())
    ) {
      await unconfigureMachineButton.click();
      const modal = page.getByRole('alertdialog');
      await modal
        .getByRole('button', { name: 'Delete All Election Data' })
        .click();
    }

    mockCardRemoval();
    await page
      .getByText(`Insert an election manager card to configure ${appName}`)
      .waitFor();
  }

  return {
    enterPin,
    logInAsSystemAdministrator,
    logInAsElectionManager,
    logInAsPollWorker,
    forceLogOutAndResetElectionDefinition,
  };
}

/**
 * Configuration for {@link buildDippedSmartCardAuthHelpers}. Dipped smart-card
 * auth (VxAdmin, VxCentralScan) reads the card on insertion and expects it to be
 * removed, after which the machine is locked.
 */
export interface DippedSmartCardAuthConfig {
  /** App name as it appears in the locked-screen text, e.g. `'VxAdmin'`. */
  appName: string;
  /**
   * Optional navigation run after logging in as system administrator but before
   * looking for the "Unconfigure Machine" button. VxAdmin must open its Election
   * screen first; VxCentralScan shows the button directly.
   */
  navigateToUnconfigure?: (page: Page) => Promise<void>;
}

export interface DippedSmartCardAuthHelpers {
  logInAsSystemAdministrator(page: Page): Promise<void>;
  logInAsElectionManager(page: Page, election: Election): Promise<void>;
  logOut(page: Page): Promise<void>;
  forceLogOutAndResetElectionDefinition(page: Page): Promise<void>;
}

/**
 * Builds Playwright auth helpers for an app that uses dipped smart-card auth
 * (the card is removed after reading, then the machine locks): VxAdmin,
 * VxCentralScan.
 */
export function buildDippedSmartCardAuthHelpers(
  config: DippedSmartCardAuthConfig
): DippedSmartCardAuthHelpers {
  const { appName, navigateToUnconfigure } = config;

  async function enterPin(page: Page): Promise<void> {
    await page.getByText('Enter Card PIN').waitFor();
    for (const digit of INTEGRATION_TEST_DEFAULT_PIN) {
      await page.getByRole('button', { name: digit }).click();
    }
    // Wait before removing the card to avoid flaky auth from premature removal.
    await page.getByText(`Remove card to unlock ${appName}`).waitFor();
  }

  async function logInAsSystemAdministrator(page: Page): Promise<void> {
    mockSystemAdministratorCardInsertion();
    await enterPin(page);
    mockCardRemoval();
    await page.getByText('Lock Machine').waitFor();
  }

  async function logInAsElectionManager(
    page: Page,
    election: Election
  ): Promise<void> {
    mockElectionManagerCardInsertion({ election });
    await enterPin(page);
    mockCardRemoval();
    await page.getByText('Lock Machine').waitFor();
  }

  async function logOut(page: Page): Promise<void> {
    await page.getByText('Lock Machine').click();
    await page.getByText(`${appName} Locked`).waitFor();
  }

  async function forceLogOut(page: Page): Promise<void> {
    await postToApi(page, 'logOut');
  }

  async function forceLogOutAndResetElectionDefinition(
    page: Page
  ): Promise<void> {
    await forceLogOut(page);
    await page.goto('/');

    await logInAsSystemAdministrator(page);
    if (navigateToUnconfigure) {
      await navigateToUnconfigure(page);
    }

    const unconfigureMachineButton = page.getByRole('button', {
      name: 'Unconfigure Machine',
    });

    if (
      (await unconfigureMachineButton.isVisible()) &&
      (await unconfigureMachineButton.isEnabled())
    ) {
      await unconfigureMachineButton.click();
      const modal = page.getByRole('alertdialog');
      await modal
        .getByRole('button', { name: 'Delete All Election Data' })
        .click();
    }

    await forceLogOut(page);
  }

  return {
    logInAsSystemAdministrator,
    logInAsElectionManager,
    logOut,
    forceLogOutAndResetElectionDefinition,
  };
}
