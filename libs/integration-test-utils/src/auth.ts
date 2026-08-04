import { expect, type Page } from '@playwright/test';
import {
  INTEGRATION_TEST_DEFAULT_PIN,
  mockCardRemoval,
  mockElectionManagerCardInsertion,
  mockPollWorkerCardInsertion,
  mockSystemAdministratorCardInsertion,
} from '@votingworks/auth';
import type { Election } from '@votingworks/types';
import { postToApi } from './api.js';

async function postToApiOrThrow(page: Page, method: string): Promise<void> {
  const response = await postToApi(page, method);
  if (!response.ok()) {
    throw new Error(
      `POST ${method} failed: ${response.status()} ${await response.text()}`
    );
  }
}

/**
 * Waits until the backend reports no card present. Mocking card removal writes
 * the mock-card file, but the auth state machine only picks it up on its next
 * poll. Inserting the next card before that poll lands means the machine never
 * observes the no-card → card transition and so never advances to PIN entry —
 * a race that makes logins after a removal intermittently hang. Polling the
 * auth status here makes the removal deterministic before the next insertion.
 */
async function waitForLoggedOut(page: Page): Promise<void> {
  await expect
    .poll(async () => (await postToApi(page, 'getAuthStatus')).text(), {
      timeout: 10_000,
    })
    .toContain('logged_out');
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
   * Whether the app's auth allows cardless voter sessions (VxMark and
   * VxMarkScan). Resetting those apps has to end any active voter session
   * explicitly: `logOut` only ends the session belonging to a card, so a
   * cardless voter session leaves the machine reporting a logged-in voter with
   * no card inserted. Apps that don't allow such sessions can't make the call
   * at all - their auth asserts on it.
   */
  allowsCardlessVoterSessions?: boolean;
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
    allowsCardlessVoterSessions = false,
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
    await postToApiOrThrow(page, 'logOut');
  }

  async function forceLogOutAndResetElectionDefinition(
    page: Page
  ): Promise<void> {
    // Has to happen before waitForLoggedOut below: a cardless voter session
    // outlives logOut, leaving the machine logged in as a voter with no card.
    if (allowsCardlessVoterSessions) {
      await postToApiOrThrow(page, 'endCardlessVoterSession');
    }
    await forceLogOut(page);
    await page.goto('/');
    mockCardRemoval();
    // Wait for the frontend to render something before inserting the SA card, so
    // the auth state machine is ready to process it.
    await page.waitForLoadState('domcontentloaded');
    // Ensure the card removal has been observed before inserting the SA card,
    // so the insertion registers as a fresh card (see waitForLoggedOut).
    await waitForLoggedOut(page);

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
    await postToApiOrThrow(page, 'logOut');
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
