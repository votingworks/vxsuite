import { electionWithMsEitherNeither } from '@votingworks/fixtures';
import {
  generateCVR,
  generateFileContentFromCVRs,
} from '@votingworks/test-utils';
import { ContestIdSchema } from '@votingworks/types';
import {
  assertExpectedResultsMatchSEMsFile,
  assertExpectedResultsMatchTallyReport,
} from '../support/assertions';

describe('Election Manager can create SEMS tallies', () => {
  it('Tallies for yes no and either neither contests compute end to end as expected', () => {
    // Generate a CVR file with votes in the president contest.
    const fakeCVRFileContents = generateFileContentFromCVRs([
      generateCVR(
        electionWithMsEitherNeither,
        {
          '750000017': ['yes'],
          '750000018': [],
          '750000015': ['yes'],
          '750000016': ['no'],
        },
        { precinctId: '6522', ballotStyleId: '5', ballotType: 'absentee' }
      ),
      generateCVR(
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
        }
      ),
      generateCVR(
        electionWithMsEitherNeither,
        {
          '750000017': ['no'],
          '750000018': ['yes', 'no'],
          '750000015': ['no'],
          '750000016': ['no'],
        },
        { precinctId: '6522', ballotStyleId: '5', scannerId: 'scanner-2' }
      ),
      generateCVR(
        electionWithMsEitherNeither,
        {
          '750000017': [],
          '750000018': ['yes'],
          '750000015': ['no'],
          '750000016': ['yes'],
        },
        { precinctId: '6522', ballotStyleId: '5' }
      ),
      generateCVR(
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
        }
      ),
      generateCVR(
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
        }
      ),
      generateCVR(
        electionWithMsEitherNeither,
        {
          '750000017': [],
          '750000018': [],
          '750000015': ['yes'],
          '750000016': [],
        },
        { precinctId: '6538', ballotStyleId: '4' }
      ),
      generateCVR(
        electionWithMsEitherNeither,
        {
          '750000017': ['yes', 'no'],
          '750000018': ['no', 'yes'],
          '750000015': ['no'],
          '750000016': ['yes', 'no'],
        },
        { precinctId: '6538', ballotStyleId: '4' }
      ),
    ]);
    cy.visit('/');
    cy.get('input[type="file"]').attachFile('electionWithMsEitherNeither.json');
    cy.contains('Election loading');
    cy.contains('Election Hash: abdfbe6a58');
    cy.contains('Tally').click();
    cy.contains('Import CVR Files').click();
    cy.get('input[data-testid="manual-input"]').attachFile({
      fileContent: new Blob([fakeCVRFileContents]),
      fileName: 'cvrFile.jsonl',
      mimeType: 'text/plain',
      encoding: 'utf-8',
    });
    cy.get('[data-testid="total-ballot-count"]').within(() => cy.contains('8'));

    // Check that the internal tally reports have the correct tallies
    cy.contains('View Unofficial Full Election Tally Report').click();
    assertExpectedResultsMatchTallyReport(
      [
        {
          contestId: ContestIdSchema.parse('750000017'),
          metadata: { ballots: 8, undervotes: 2, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 4,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000018'),
          metadata: { ballots: 8, undervotes: 2, overvotes: 2 },
          votesByOptionId: {
            yes: 2,
            no: 2,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000015'),
          metadata: { ballots: 8, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 3,
            no: 3,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000016'),
          metadata: { ballots: 8, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 3,
            no: 3,
          },
        },
      ],
      { absentee: 4, precinct: 4 }
    );
    cy.contains('Back to Tally Index').click();
    cy.contains('View Unofficial District 5 Tally Report').click();
    assertExpectedResultsMatchTallyReport(
      [
        {
          contestId: ContestIdSchema.parse('750000017'),
          metadata: { ballots: 4, undervotes: 1, overvotes: 0 },
          votesByOptionId: {
            yes: 1,
            no: 2,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000018'),
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 2,
            no: 0,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000015'),
          metadata: { ballots: 4, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 2,
            no: 2,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000016'),
          metadata: { ballots: 4, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 2,
            no: 2,
          },
        },
      ],
      { absentee: 2, precinct: 2 }
    );
    cy.contains('Back to Tally Index').click();
    cy.contains('View Unofficial Bywy Tally Report').click();
    assertExpectedResultsMatchTallyReport(
      [
        {
          contestId: ContestIdSchema.parse('750000017'),
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 0,
            no: 2,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000018'),
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 0,
            no: 2,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000015'),
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 1,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000016'),
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 1,
          },
        },
      ],
      { absentee: 2, precinct: 2 }
    );
    cy.contains('Back to Tally Index').click();
    cy.contains('View Unofficial Panhandle Tally Report').click();
    assertExpectedResultsMatchTallyReport(
      [
        {
          contestId: ContestIdSchema.parse('750000017'),
          metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 0,
            no: 0,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000018'),
          metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 0,
            no: 0,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000015'),
          metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 0,
            no: 0,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000016'),
          metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 0,
            no: 0,
          },
        },
      ],
      { absentee: 0, precinct: 0 }
    );
    cy.contains('Back to Tally Index').click();
    cy.contains('View Unofficial Absentee Ballot Tally Report').click();
    assertExpectedResultsMatchTallyReport(
      [
        {
          contestId: ContestIdSchema.parse('750000017'),
          metadata: { ballots: 4, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 1,
            no: 3,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000018'),
          metadata: { ballots: 4, undervotes: 1, overvotes: 0 },
          votesByOptionId: {
            yes: 1,
            no: 2,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000015'),
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 2,
            no: 0,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000016'),
          metadata: { ballots: 4, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 2,
            no: 2,
          },
        },
      ],
      { hide: true }
    );
    cy.contains('Back to Tally Index').click();
    cy.contains('View Unofficial Precinct Ballot Tally Report').click();
    assertExpectedResultsMatchTallyReport(
      [
        {
          contestId: ContestIdSchema.parse('750000017'),
          metadata: { ballots: 4, undervotes: 2, overvotes: 1 },
          votesByOptionId: {
            yes: 0,
            no: 1,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000018'),
          metadata: { ballots: 4, undervotes: 1, overvotes: 2 },
          votesByOptionId: {
            yes: 1,
            no: 0,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000015'),
          metadata: { ballots: 4, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 1,
            no: 3,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000016'),
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 1,
          },
        },
      ],
      { hide: true }
    );
    cy.contains('Back to Tally Index').click();
    cy.contains('View Unofficial Scanner scanner-1 Tally Report').click();
    assertExpectedResultsMatchTallyReport(
      [
        {
          contestId: ContestIdSchema.parse('750000017'),
          metadata: { ballots: 4, undervotes: 2, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 0,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000018'),
          metadata: { ballots: 4, undervotes: 2, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 0,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000015'),
          metadata: { ballots: 4, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 2,
            no: 2,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000016'),
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 1,
          },
        },
      ],
      { absentee: 1, precinct: 3 }
    );
    cy.contains('Back to Tally Index').click();
    cy.contains('View Unofficial Scanner scanner-2 Tally Report').click();
    assertExpectedResultsMatchTallyReport(
      [
        {
          contestId: ContestIdSchema.parse('750000017'),
          metadata: { ballots: 4, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 0,
            no: 4,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000018'),
          metadata: { ballots: 4, undervotes: 0, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 2,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000015'),
          metadata: { ballots: 4, undervotes: 1, overvotes: 1 },
          votesByOptionId: {
            yes: 1,
            no: 1,
          },
        },
        {
          contestId: ContestIdSchema.parse('750000016'),
          metadata: { ballots: 4, undervotes: 0, overvotes: 0 },
          votesByOptionId: {
            yes: 2,
            no: 2,
          },
        },
      ],
      { absentee: 3, precinct: 1 }
    );
    cy.contains('Back to Tally Index').click();

    // Check that the exported SEMS result file as the correct tallies
    cy.contains('Save Results File').click();
    cy.get('[data-testid="manual-export"]').click();
    cy.contains('Results Saved');
    cy.task<string>('readMostRecentFile', 'cypress/downloads').then(
      (fileContent) => {
        assertExpectedResultsMatchSEMsFile(
          [
            {
              contestId: ContestIdSchema.parse('750000017'),
              precinctId: '6522',
              candidateId: '750000094',
              numberOfVotes: 1,
            },
            {
              contestId: ContestIdSchema.parse('750000017'),
              precinctId: '6522',
              candidateId: '750000095',
              numberOfVotes: 2,
            },
            {
              contestId: ContestIdSchema.parse('750000017'),
              precinctId: '6522',
              candidateId: '1', // overvotes
              numberOfVotes: 0,
            },
            {
              contestId: ContestIdSchema.parse('750000017'),
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 1,
            },
            {
              contestId: ContestIdSchema.parse('750000018'),
              precinctId: '6522',
              candidateId: '750000092',
              numberOfVotes: 2,
            },
            {
              contestId: ContestIdSchema.parse('750000018'),
              precinctId: '6522',
              candidateId: '750000093',
              numberOfVotes: 0,
            },
            {
              contestId: ContestIdSchema.parse('750000018'),
              precinctId: '6522',
              candidateId: '1', // overvotes
              numberOfVotes: 1,
            },
            {
              contestId: ContestIdSchema.parse('750000018'),
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 1,
            },
            {
              contestId: ContestIdSchema.parse('750000015'),
              precinctId: '6522',
              candidateId: '750000088',
              numberOfVotes: 2,
            },
            {
              contestId: ContestIdSchema.parse('750000015'),
              precinctId: '6522',
              candidateId: '750000089',
              numberOfVotes: 2,
            },
            {
              contestId: ContestIdSchema.parse('750000015'),
              precinctId: '6522',
              candidateId: '1', // overvotes
              numberOfVotes: 0,
            },
            {
              contestId: ContestIdSchema.parse('750000015'),
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 0,
            },
            {
              contestId: ContestIdSchema.parse('750000016'),
              precinctId: '6522',
              candidateId: '750000090',
              numberOfVotes: 2,
            },
            {
              contestId: ContestIdSchema.parse('750000016'),
              precinctId: '6522',
              candidateId: '750000091',
              numberOfVotes: 2,
            },
            {
              contestId: ContestIdSchema.parse('750000016'),
              precinctId: '6522',
              candidateId: '1', // overvotes
              numberOfVotes: 0,
            },
            {
              contestId: ContestIdSchema.parse('750000016'),
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 0,
            },
            {
              contestId: ContestIdSchema.parse('750000017'),
              precinctId: '6538',
              candidateId: '750000094',
              numberOfVotes: 0,
            },
            {
              contestId: ContestIdSchema.parse('750000017'),
              precinctId: '6538',
              candidateId: '750000095',
              numberOfVotes: 2,
            },
            {
              contestId: ContestIdSchema.parse('750000017'),
              precinctId: '6538',
              candidateId: '1', // overvotes
              numberOfVotes: 1,
            },
            {
              contestId: ContestIdSchema.parse('750000017'),
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 1,
            },
            {
              contestId: ContestIdSchema.parse('750000018'),
              precinctId: '6538',
              candidateId: '750000092',
              numberOfVotes: 0,
            },
            {
              contestId: ContestIdSchema.parse('750000018'),
              precinctId: '6538',
              candidateId: '750000093',
              numberOfVotes: 2,
            },
            {
              contestId: ContestIdSchema.parse('750000018'),
              precinctId: '6538',
              candidateId: '1', // overvotes
              numberOfVotes: 1,
            },
            {
              contestId: ContestIdSchema.parse('750000018'),
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 1,
            },
            {
              contestId: ContestIdSchema.parse('750000015'),
              precinctId: '6538',
              candidateId: '750000088',
              numberOfVotes: 1,
            },
            {
              contestId: ContestIdSchema.parse('750000015'),
              precinctId: '6538',
              candidateId: '750000089',
              numberOfVotes: 1,
            },
            {
              contestId: ContestIdSchema.parse('750000015'),
              precinctId: '6538',
              candidateId: '1', // overvotes
              numberOfVotes: 1,
            },
            {
              contestId: ContestIdSchema.parse('750000015'),
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 1,
            },
            {
              contestId: ContestIdSchema.parse('750000016'),
              precinctId: '6538',
              candidateId: '750000090',
              numberOfVotes: 1,
            },
            {
              contestId: ContestIdSchema.parse('750000016'),
              precinctId: '6538',
              candidateId: '750000091',
              numberOfVotes: 1,
            },
            {
              contestId: ContestIdSchema.parse('750000016'),
              precinctId: '6538',
              candidateId: '1', // overvotes
              numberOfVotes: 1,
            },
            {
              contestId: ContestIdSchema.parse('750000016'),
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 1,
            },
            {
              contestId: ContestIdSchema.parse('775020870'),
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: ContestIdSchema.parse('775020870'),
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: ContestIdSchema.parse('775020872'),
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: ContestIdSchema.parse('775020872'),
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: ContestIdSchema.parse('775020876'),
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: ContestIdSchema.parse('775020876'),
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: ContestIdSchema.parse('775020877'),
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: ContestIdSchema.parse('775020877'),
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: ContestIdSchema.parse('775020903'),
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: ContestIdSchema.parse('775020903'),
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: ContestIdSchema.parse('775020904'),
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: ContestIdSchema.parse('775020904'),
              precinctId: '6522',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: ContestIdSchema.parse('775020899'),
              precinctId: '6538',
              candidateId: '2', // undervotes
              numberOfVotes: 4,
            },
            {
              contestId: ContestIdSchema.parse('775020899'),
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
