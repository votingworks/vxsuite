import { Buffer } from 'buffer';
import { methodUrl } from '@votingworks/grout';
import { sha256 } from 'js-sha256';

// Importing all of @votingworks/auth causes Cypress tests to fail since @votingworks/auth contains
// code that isn't browser-safe
// eslint-disable-next-line vx/no-import-workspace-subfolders
import {
  DEV_JURISDICTION,
  mockCard,
  MockFileContents,
} from '@votingworks/auth/src/cypress';

const PIN = '000000';

function mockCardCypress(mockFileContents: MockFileContents): void {
  mockCard(mockFileContents, cy.writeFile);
}

function mockElectionManagerCard() {
  cy.readFile('cypress/fixtures/election.json', null).then(
    (electionBytes: Uint8Array) => {
      const electionData = Buffer.from(electionBytes);
      const electionHash = sha256(electionBytes);
      mockCardCypress({
        cardStatus: {
          status: 'ready',
          cardDetails: {
            user: {
              role: 'election_manager',
              jurisdiction: DEV_JURISDICTION,
              electionHash,
            },
          },
        },
        data: electionData,
        pin: PIN,
      });
    }
  );
}

function enterPin() {
  for (const digit of PIN) {
    cy.get(`button:contains(${digit})`).click();
  }
}

function removeCard() {
  mockCardCypress({
    cardStatus: {
      status: 'no_card',
    },
  });
}

function logOut() {
  cy.request('POST', methodUrl('logOut', 'http://localhost:3000/api'), {});
}

describe('BSD and services/Scan', () => {
  beforeEach(() => {
    logOut();
    // Unconfigure services/scan
    cy.request('DELETE', '/central-scanner/config/election');
    mockElectionManagerCard();
    cy.visit('/');
    enterPin();
    removeCard();

    // TODO replace with UI interaction when mock USB is supported
    cy.request(
      'POST',
      methodUrl(
        'configureWithSampleBallotPackageForIntegrationTest',
        'http://localhost:3000/api'
      ),
      {}
    );
    cy.reload();
  });

  it('BSD can be configured with services/scan with a ZIP ballot package and can configure advanced options', () => {
    cy.contains('Admin').click();
    cy.contains('Toggle to Official Ballot Mode').click();
    cy.get('button[data-testid="confirm-toggle"]')
      .contains('Toggle to Official Ballot Mode')
      .click();
    cy.contains('No ballots have been scanned', { timeout: 30000 });
    cy.contains('Scan New Batch').click();
    cy.contains('A total of 1 ballot has been scanned in 1 batch.');

    /*
     * Disabling these lines because with manual export removed from the
     * product it requires a USB drive which we have not developed mocking for.
     */
    // cy.contains('Save CVRs').click();
    // cy.contains('Save').click();
    // cy.contains('Cancel').click();
    // cy.contains('Admin').click();

    /* Disabling the remainder of this test because file download appears to be causing problems in Cypress.
     * See https://github.com/cypress-io/cypress/issues/14168#issuecomment-763323563 and https://github.com/cypress-io/cypress/issues/949
     * Potential solutions: upgrade to cypress 6.3.0 or intercept the file download? https://docs.cypress.io/faq/questions/using-cypress-faq#Is-there-a-way-to-test-that-a-file-got-downloaded-I-want-to-test-that-a-button-click-triggers-a-download
     * Intercepting the file download will require additional work to mark on the server that a backup happened.
     */
    // cy.contains('Save Backup').click();
    // cy.contains('Delete Ballot Data').click();
    // cy.contains('Yes, Delete Ballot Data').click();
    // cy.contains('No ballots have been scanned', { timeout: 20000 });
    // cy.contains('Scan New Batch').click();
    // cy.contains('A total of 1 ballot has been scanned in 1 batch.');
    // cy.contains('Admin').click();
    // cy.contains('Toggle to Test Ballot Mode').click();
    // cy.get('button[data-testid="confirm-toggle"]')
    //   .contains('Toggle to Test Ballot Mode')
    //   .click();
    // cy.contains('VxCentralScan TEST MODE', { timeout: 30000 });
    // cy.contains('No ballots have been scanned');
    // cy.contains('Scan New Batch').click();
    // // We are now in test mode so the official ballot will not scan
    // cy.contains('Remove the OFFICIAL ballot before continuing');
    // cy.contains('Confirm Ballot Removed and Continue Scanning').click();
    // cy.contains('Admin').click();
    // cy.contains('Toggle to Official Ballot Mode');
    // cy.contains('Save Backup').click();
    // cy.contains('Delete Election Data from VxCentralScan').click();
    // cy.contains('Yes, Delete Election Data').click();
    // cy.contains('Are you sure?');
    // cy.contains('I am sure. Delete all election data').click();
    // cy.contains('Deleting election data');
    // cy.contains('Load Election Configuration', { timeout: 20000 });
  });
});
