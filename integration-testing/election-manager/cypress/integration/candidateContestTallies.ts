import { electionMultiPartyPrimaryWithDataFiles } from '@votingworks/fixtures'
import {
  generateCVR,
  generateFileContentFromCVRs,
} from '@votingworks/test-utils'
import {
  assertExpectedResultsMatchSEMsFile,
  assertExpectedResultsMatchTallyReport,
} from '../support/assertions'

describe('Election Manager can create SEMS tallies', () => {
  it('Tallies for candidate contests compute end to end as expected', () => {
    const { electionDefinition } = electionMultiPartyPrimaryWithDataFiles
    const { election } = electionDefinition
    // Generate a CVR file with votes in the president contest.
    const fakeCVRFileContents = generateFileContentFromCVRs([
      generateCVR(
        election,
        {
          'governor-contest-liberty': ['aaron-aligator'],
          'schoolboard-liberty': [],
        },
        { _precinctId: 'precinct-2', _ballotStyleId: '2L' }
      ),
      generateCVR(
        election,
        {
          'governor-contest-liberty': ['peter-pigeon'],
          'schoolboard-liberty': ['amber-brkich', 'chris-daugherty'],
        },
        { _precinctId: 'precinct-2', _ballotStyleId: '2L' }
      ),
      generateCVR(
        election,
        {
          'governor-contest-liberty': ['aaron-aligator', 'peter-pigeon'],
          'schoolboard-liberty': [
            'amber-brkich',
            'chris-daugherty',
            'tom-westman',
          ],
        },
        { _precinctId: 'precinct-2', _ballotStyleId: '2L' }
      ),
      generateCVR(
        election,
        {
          'governor-contest-liberty': ['aaron-aligator'],
          'schoolboard-liberty': [
            'amber-brkich',
            'chris-daugherty',
            'tom-westman',
            'danni-boatwright',
          ],
        },
        { _precinctId: 'precinct-2', _ballotStyleId: '2L' }
      ),
      generateCVR(
        election,
        {
          'governor-contest-liberty': [],
          'schoolboard-liberty': ['amber-brkich'],
        },
        { _precinctId: 'precinct-2', _ballotStyleId: '2L' }
      ),
    ])
    cy.visit('/')
    cy.get('input[type="file"]').attachFile(
      'electionMultiPartyPrimarySample.json'
    )
    cy.contains('Election loading')
    cy.contains('Election Hash: 28d2f3e8b7')
    cy.contains('Tally').click()
    cy.contains('Import CVR Files').click()
    cy.get('input[data-testid="manual-input"]').attachFile({
      fileContent: new Blob([fakeCVRFileContents]),
      fileName: 'cvrFile.jsonl',
      mimeType: 'application/json',
      encoding: 'utf-8',
    })
    cy.get('[data-testid="total-ballot-count"]').within(() => cy.contains('5'))

    // Check that the internal tally reports have the correct tallies
    const expectedFullResults = [
      {
        contestId: 'governor-contest-liberty',
        metadata: { ballots: 5, undervotes: 1, overvotes: 1 },
        votesByOptionId: {
          'aaron-aligator': 2,
          'peter-pigeon': 1,
          '__write-in': 0,
        },
      },
      {
        contestId: 'schoolboard-liberty',
        metadata: { ballots: 5, undervotes: 3, overvotes: 4 },
        votesByOptionId: {
          'amber-brkich': 2,
          'chris-daugherty': 1,
          'tom-westman': 0,
          'danni-boatwright': 0,
          '__write-in': 0,
        },
      },
    ]

    const expectedEmptyResults = [
      {
        contestId: 'governor-contest-liberty',
        metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
        votesByOptionId: {
          'aaron-aligator': 0,
          'peter-pigeon': 0,
          '__write-in': 0,
        },
      },
      {
        contestId: 'schoolboard-liberty',
        metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
        votesByOptionId: {
          'amber-brkich': 0,
          'chris-daugherty': 0,
          'tom-westman': 0,
          'danni-boatwright': 0,
          '__write-in': 0,
        },
      },
    ]
    cy.contains('View Unofficial Full Election Tally Report').click()
    assertExpectedResultsMatchTallyReport(expectedFullResults, {
      absentee: 0,
      precinct: 5,
    })
    cy.contains('Back to Tally Index').click()
    cy.contains('View Unofficial Precinct 2 Tally Report').click()
    assertExpectedResultsMatchTallyReport(expectedFullResults, {
      absentee: 0,
      precinct: 5,
    })
    cy.contains('Back to Tally Index').click()
    cy.contains('View Unofficial Precinct 1 Tally Report').click()
    assertExpectedResultsMatchTallyReport(expectedEmptyResults, {
      absentee: 0,
      precinct: 0,
    })
    cy.contains('Back to Tally Index').click()
    cy.contains('View Unofficial Precinct 3 Tally Report').click()
    assertExpectedResultsMatchTallyReport(expectedEmptyResults, {
      absentee: 0,
      precinct: 0,
    })
    cy.contains('Back to Tally Index').click()
    cy.contains('View Unofficial Precinct 4 Tally Report').click()
    assertExpectedResultsMatchTallyReport(expectedEmptyResults, {
      absentee: 0,
      precinct: 0,
    })
    cy.contains('Back to Tally Index').click()
    cy.contains('View Unofficial Precinct 5 Tally Report').click()
    assertExpectedResultsMatchTallyReport(expectedEmptyResults, {
      absentee: 0,
      precinct: 0,
    })
    cy.contains('Back to Tally Index').click()
    cy.contains('View Unofficial Liberty Party Tally Report').click()
    assertExpectedResultsMatchTallyReport(expectedFullResults, {
      absentee: 0,
      precinct: 5,
    })
    cy.contains('Back to Tally Index').click()
    cy.contains('View Unofficial Scanner scanner-1 Tally Report').click()
    assertExpectedResultsMatchTallyReport(expectedFullResults, {
      absentee: 0,
      precinct: 5,
    })
    cy.contains('Back to Tally Index').click()

    // Check that the exported SEMS result file as the correct tallies
    cy.contains('Save Results File').click()
    cy.get('[data-testid="manual-export"]').click()
    cy.contains('Results Saved')
    cy.task<string>('readMostRecentFile', 'cypress/downloads').then(
      (fileContent) => {
        assertExpectedResultsMatchSEMsFile(
          [
            {
              contestId: 'governor-contest-liberty',
              precinctId: 'precinct-2',
              candidateId: 'aaron-aligator',
              numberOfVotes: 2,
            },
            {
              contestId: 'governor-contest-liberty',
              precinctId: 'precinct-2',
              candidateId: 'peter-pigeon',
              numberOfVotes: 1,
            },
            {
              contestId: 'governor-contest-liberty',
              precinctId: 'precinct-2',
              candidateId: '2', // undervotes
              numberOfVotes: 1,
            },
            {
              contestId: 'governor-contest-liberty',
              precinctId: 'precinct-2',
              candidateId: '1', // overvotes
              numberOfVotes: 1,
            },
            {
              contestId: 'schoolboard-liberty',
              precinctId: 'precinct-2',
              candidateId: '2', // undervotes
              numberOfVotes: 3,
            },
            {
              contestId: 'schoolboard-liberty',
              precinctId: 'precinct-2',
              candidateId: '1', // overvotes
              numberOfVotes: 4,
            },
            {
              contestId: 'schoolboard-liberty',
              precinctId: 'precinct-2',
              candidateId: 'amber-brkich',
              numberOfVotes: 2,
            },
            {
              contestId: 'schoolboard-liberty',
              precinctId: 'precinct-2',
              candidateId: 'chris-daugherty',
              numberOfVotes: 1,
            },
            {
              contestId: 'chief-pokemon-liberty',
              precinctId: 'precinct-2',
              candidateId: '2', // undervotes
              numberOfVotes: 5,
            },
          ],
          fileContent
        )
      }
    )
  })
})
