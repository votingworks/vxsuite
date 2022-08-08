import { electionWithMsEitherNeitherDefinition } from '@votingworks/fixtures';
import {
  generateCvr,
  generateFileContentFromCvrs,
} from '@votingworks/test-utils';
import { BallotIdSchema, unsafeParse } from '@votingworks/types';
import {
  assertExpectedResultsMatchSEMsFile,
  assertExpectedResultsMatchTallyReport,
} from '../support/assertions';
import {
  electionWithMsEitherNeitherCypressHash,
  enterPin,
  mockCardRemoval,
  mockElectionManagerCardInsertion,
  mockSystemAdministratorCardInsertion,
} from '../support/auth';

describe('Election Manager can create SEMS tallies', () => {
  it('Tallies for yes no and either neither contests compute end to end as expected', () => {
    const electionWithMsEitherNeither =
      electionWithMsEitherNeitherDefinition.election;
    // Generate a CVR file with votes in the president contest.
    const fakeCvrFileContents = generateFileContentFromCvrs([
      generateCvr(
        electionWithMsEitherNeither,
        {
          '750000017': ['yes'],
          '750000018': [],
          '750000015': ['yes'],
          '750000016': ['no'],
        },
        {
          precinctId: '6522',
          ballotStyleId: '5',
          ballotType: 'absentee',
          ballotId: unsafeParse(BallotIdSchema, '1'),
        }
      ),
      generateCvr(
        electionWithMsEitherNeither,
        {
          '750000017': ['no'],
          '750000018': ['yes'],
          '750000015': ['yes'],
          '750000016': ['yes'],
        },
        {
          precinctId: '6522',
          ballotStyleId: '5',
          ballotType: 'absentee',
          scannerId: 'scanner-2',
          ballotId: unsafeParse(BallotIdSchema, '2'),
        }
      ),
      generateCvr(
        electionWithMsEitherNeither,
        {
          '750000017': ['no'],
          '750000018': ['yes', 'no'],
          '750000015': ['no'],
          '750000016': ['no'],
        },
        {
          precinctId: '6522',
          ballotStyleId: '5',
          scannerId: 'scanner-2',
          ballotId: unsafeParse(BallotIdSchema, '3'),
        }
      ),
      generateCvr(
        electionWithMsEitherNeither,
        {
          '750000017': [],
          '750000018': ['yes'],
          '750000015': ['no'],
          '750000016': ['yes'],
        },
        {
          precinctId: '6522',
          ballotStyleId: '5',
          ballotId: unsafeParse(BallotIdSchema, '4'),
        }
      ),
      generateCvr(
        electionWithMsEitherNeither,
        {
          '750000017': ['no'],
          '750000018': ['no'],
          '750000015': [],
          '750000016': ['yes'],
        },
        {
          precinctId: '6538',
          ballotStyleId: '4',
          ballotType: 'absentee',
          scannerId: 'scanner-2',
          ballotId: unsafeParse(BallotIdSchema, '5'),
        }
      ),
      generateCvr(
        electionWithMsEitherNeither,
        {
          '750000017': ['no'],
          '750000018': ['no'],
          '750000015': ['yes', 'no'],
          '750000016': ['no'],
        },
        {
          precinctId: '6538',
          ballotStyleId: '4',
          ballotType: 'absentee',
          scannerId: 'scanner-2',
          ballotId: unsafeParse(BallotIdSchema, '6'),
        }
      ),
      generateCvr(
        electionWithMsEitherNeither,
        {
          '750000017': [],
          '750000018': [],
          '750000015': ['yes'],
          '750000016': [],
        },
        {
          precinctId: '6538',
          ballotStyleId: '4',
          ballotId: unsafeParse(BallotIdSchema, '7'),
        }
      ),
      generateCvr(
        electionWithMsEitherNeither,
        {
          '750000017': ['yes', 'no'],
          '750000018': ['no', 'yes'],
          '750000015': ['no'],
          '750000016': ['yes', 'no'],
        },
        {
          precinctId: '6538',
          ballotStyleId: '4',
          ballotId: unsafeParse(BallotIdSchema, '8'),
        }
      ),
      // duplicate cvr should be ignored
      generateCvr(
        electionWithMsEitherNeither,
        {
          '750000017': ['yes', 'no'],
          '750000018': ['no', 'yes'],
          '750000015': ['no'],
          '750000016': ['yes', 'no'],
        },
        {
          precinctId: '6538',
          ballotStyleId: '4',
          ballotId: unsafeParse(BallotIdSchema, '8'),
        }
      ),
    ]);
    cy.visit('/');
    mockSystemAdministratorCardInsertion();
    enterPin();
    mockCardRemoval();
    cy.contains('Convert from SEMS files');
    cy.get('input[type="file"]').attachFile('electionWithMsEitherNeither.json');
    cy.contains('Election loading', { timeout: 8000 });
    cy.contains(electionWithMsEitherNeitherCypressHash.slice(0, 10));
    cy.pause();
    cy.contains('Lock Machine').click();
    mockElectionManagerCardInsertion({
      electionData: electionWithMsEitherNeitherDefinition.electionData,
      electionHash: electionWithMsEitherNeitherCypressHash,
    });
    enterPin();
    mockCardRemoval();
    cy.contains('Tally').click();
    cy.contains('Import CVR Files').click();
    cy.get('input[data-testid="manual-input"]').attachFile({
      fileContent: new Blob([fakeCvrFileContents]),
      fileName: 'cvrFile.jsonl',
      mimeType: 'text/plain',
      encoding: 'utf-8',
    });
    cy.contains('Close').click();
    cy.get('[data-testid="total-cvr-count"]').within(() => cy.contains('8'));

    // Check that the internal tally reports have the correct tallies
    cy.contains('Reports').click();
    cy.contains('Unofficial Full Election Tally Report').click();
    assertExpectedResultsMatchTallyReport(
      [
        {
          contestId: '750000017',
          metadata: { ballots: 8, undervotes: 2, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 4,
          },
        },
        {
          contestId: '750000018',
          metadata: { ballots: 8, undervotes: 2, overvotes: 2 },
          votesByOptionId: {
            yes: 2,
            no: 2,
          },
        },
        {
          contestId: '750000015',
          metadata: { ballots: 8, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 3,
            no: 3,
          },
        },
        {
          contestId: '750000016',
          metadata: { ballots: 8, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 3,
            no: 3,
          },
        },
      ],
      { absentee: 4, precinct: 4 }
    );
    cy.contains('Back to Reports').click();
    cy.contains('Unofficial District 5 Tally Report').click();
    assertExpectedResultsMatchTallyReport(
      [
        {
          contestId: '750000017',
          metadata: { ballots: 4, undervotes: 1, overvotes: 0 },
          votesByOptionId: {
            yes: 1,
            no: 2,
          },
        },
        {
          contestId: '750000018',
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 2,
            no: 0,
          },
        },
        {
          contestId: '750000015',
          metadata: { ballots: 4, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 2,
            no: 2,
          },
        },
        {
          contestId: '750000016',
          metadata: { ballots: 4, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 2,
            no: 2,
          },
        },
      ],
      { absentee: 2, precinct: 2 }
    );
    cy.contains('Back to Reports').click();
    cy.contains('Unofficial Bywy Tally Report').click();
    assertExpectedResultsMatchTallyReport(
      [
        {
          contestId: '750000017',
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 0,
            no: 2,
          },
        },
        {
          contestId: '750000018',
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 0,
            no: 2,
          },
        },
        {
          contestId: '750000015',
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 1,
          },
        },
        {
          contestId: '750000016',
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 1,
          },
        },
      ],
      { absentee: 2, precinct: 2 }
    );
    cy.contains('Back to Reports').click();
    cy.contains('Unofficial Panhandle Tally Report').click();
    assertExpectedResultsMatchTallyReport(
      [
        {
          contestId: '750000017',
          metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 0,
            no: 0,
          },
        },
        {
          contestId: '750000018',
          metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 0,
            no: 0,
          },
        },
        {
          contestId: '750000015',
          metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 0,
            no: 0,
          },
        },
        {
          contestId: '750000016',
          metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 0,
            no: 0,
          },
        },
      ],
      { absentee: 0, precinct: 0 }
    );
    cy.contains('Back to Reports').click();
    cy.contains('Unofficial Absentee Ballot Tally Report').click();
    assertExpectedResultsMatchTallyReport(
      [
        {
          contestId: '750000017',
          metadata: { ballots: 4, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 1,
            no: 3,
          },
        },
        {
          contestId: '750000018',
          metadata: { ballots: 4, undervotes: 1, overvotes: 0 },
          votesByOptionId: {
            yes: 1,
            no: 2,
          },
        },
        {
          contestId: '750000015',
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 2,
            no: 0,
          },
        },
        {
          contestId: '750000016',
          metadata: { ballots: 4, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 2,
            no: 2,
          },
        },
      ],
      { hide: true }
    );
    cy.contains('Back to Reports').click();
    cy.contains('Unofficial Precinct Ballot Tally Report').click();
    assertExpectedResultsMatchTallyReport(
      [
        {
          contestId: '750000017',
          metadata: { ballots: 4, undervotes: 2, overvotes: 1 },
          votesByOptionId: {
            yes: 0,
            no: 1,
          },
        },
        {
          contestId: '750000018',
          metadata: { ballots: 4, undervotes: 1, overvotes: 2 },
          votesByOptionId: {
            yes: 1,
            no: 0,
          },
        },
        {
          contestId: '750000015',
          metadata: { ballots: 4, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 1,
            no: 3,
          },
        },
        {
          contestId: '750000016',
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 1,
          },
        },
      ],
      { hide: true }
    );
    cy.contains('Back to Reports').click();
    cy.contains('Unofficial Scanner scanner-1 Tally Report').click();
    assertExpectedResultsMatchTallyReport(
      [
        {
          contestId: '750000017',
          metadata: { ballots: 4, undervotes: 2, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 0,
          },
        },
        {
          contestId: '750000018',
          metadata: { ballots: 4, undervotes: 2, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 0,
          },
        },
        {
          contestId: '750000015',
          metadata: { ballots: 4, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 2,
            no: 2,
          },
        },
        {
          contestId: '750000016',
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 1,
          },
        },
      ],
      { absentee: 1, precinct: 3 }
    );
    cy.contains('Back to Reports').click();
    cy.contains('Unofficial Scanner scanner-2 Tally Report').click();
    assertExpectedResultsMatchTallyReport(
      [
        {
          contestId: '750000017',
          metadata: { ballots: 4, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 0,
            no: 4,
          },
        },
        {
          contestId: '750000018',
          metadata: { ballots: 4, undervotes: 0, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 2,
          },
        },
        {
          contestId: '750000015',
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 1,
          },
        },
        {
          contestId: '750000016',
          metadata: { ballots: 4, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 2,
            no: 2,
          },
        },
      ],
      { absentee: 3, precinct: 1 }
    );
    cy.contains('Back to Reports').click();

    // Check that the exported SEMS result file as the correct tallies
    cy.contains('Save Results File').click();
    cy.get('[data-testid="manual-export"]').click();
    cy.contains('Results Saved', { timeout: 8000 });
    cy.task<string>('readMostRecentFile', 'cypress/downloads').then(
      (fileContent) => {
        assertExpectedResultsMatchSEMsFile(
          [
            {
              contestId: '750000017',
              precinctId: '6522',
              candidateId: '750000094',
              numberOfVotes: 1,
            },
            {
              contestId: '750000017',
              precinctId: '6522',
              candidateId: '750000095',
              numberOfVotes: 2,
            },
            {
              contestId: '750000017',
              precinctId: '6522',
              candidateId: '1', // overvotes
              numberOfVotes: 0,
            },
            {
              contestId: '750000017',
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 1,
            },
            {
              contestId: '750000018',
              precinctId: '6522',
              candidateId: '750000092',
              numberOfVotes: 2,
            },
            {
              contestId: '750000018',
              precinctId: '6522',
              candidateId: '750000093',
              numberOfVotes: 0,
            },
            {
              contestId: '750000018',
              precinctId: '6522',
              candidateId: '1', // overvotes
              numberOfVotes: 1,
            },
            {
              contestId: '750000018',
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 1,
            },
            {
              contestId: '750000015',
              precinctId: '6522',
              candidateId: '750000088',
              numberOfVotes: 2,
            },
            {
              contestId: '750000015',
              precinctId: '6522',
              candidateId: '750000089',
              numberOfVotes: 2,
            },
            {
              contestId: '750000015',
              precinctId: '6522',
              candidateId: '1', // overvotes
              numberOfVotes: 0,
            },
            {
              contestId: '750000015',
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 0,
            },
            {
              contestId: '750000016',
              precinctId: '6522',
              candidateId: '750000090',
              numberOfVotes: 2,
            },
            {
              contestId: '750000016',
              precinctId: '6522',
              candidateId: '750000091',
              numberOfVotes: 2,
            },
            {
              contestId: '750000016',
              precinctId: '6522',
              candidateId: '1', // overvotes
              numberOfVotes: 0,
            },
            {
              contestId: '750000016',
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 0,
            },
            {
              contestId: '750000017',
              precinctId: '6538',
              candidateId: '750000094',
              numberOfVotes: 0,
            },
            {
              contestId: '750000017',
              precinctId: '6538',
              candidateId: '750000095',
              numberOfVotes: 2,
            },
            {
              contestId: '750000017',
              precinctId: '6538',
              candidateId: '1', // overvotes
              numberOfVotes: 1,
            },
            {
              contestId: '750000017',
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 1,
            },
            {
              contestId: '750000018',
              precinctId: '6538',
              candidateId: '750000092',
              numberOfVotes: 0,
            },
            {
              contestId: '750000018',
              precinctId: '6538',
              candidateId: '750000093',
              numberOfVotes: 2,
            },
            {
              contestId: '750000018',
              precinctId: '6538',
              candidateId: '1', // overvotes
              numberOfVotes: 1,
            },
            {
              contestId: '750000018',
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 1,
            },
            {
              contestId: '750000015',
              precinctId: '6538',
              candidateId: '750000088',
              numberOfVotes: 1,
            },
            {
              contestId: '750000015',
              precinctId: '6538',
              candidateId: '750000089',
              numberOfVotes: 1,
            },
            {
              contestId: '750000015',
              precinctId: '6538',
              candidateId: '1', // overvotes
              numberOfVotes: 1,
            },
            {
              contestId: '750000015',
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 1,
            },
            {
              contestId: '750000016',
              precinctId: '6538',
              candidateId: '750000090',
              numberOfVotes: 1,
            },
            {
              contestId: '750000016',
              precinctId: '6538',
              candidateId: '750000091',
              numberOfVotes: 1,
            },
            {
              contestId: '750000016',
              precinctId: '6538',
              candidateId: '1', // overvotes
              numberOfVotes: 1,
            },
            {
              contestId: '750000016',
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 1,
            },
            {
              contestId: '775020870',
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: '775020870',
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: '775020872',
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: '775020872',
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: '775020876',
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: '775020876',
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: '775020877',
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: '775020877',
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: '775020903',
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: '775020903',
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: '775020904',
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: '775020904',
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: '775020899',
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: '775020899',
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
          ],
          fileContent
        );
      }
    );
  });
});
