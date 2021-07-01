import { electionMultiPartyPrimaryWithDataFiles } from '@votingworks/fixtures'
import {
  generateCVR,
  generateFileContentFromCVRs,
} from '@votingworks/test-utils'
import { assertExpectedResultsMatchSEMsFile } from '../support/assertions'

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
    const assertTallyReportHasFullTally = () => {
      cy.contains('Preview Report').click()
      cy.get('[data-testid="absentee"]').within(() => cy.contains('0'))
      cy.get('[data-testid="standard"]').within(() => cy.contains('5'))
      cy.get('[data-testid="total"]').within(() => cy.contains('5'))
      cy.get('[data-testid="results-table-governor-contest-liberty').within(
        () => {
          cy.contains('5 ballots cast')
          cy.contains('1 overvote')
          cy.contains('1 undervote')
        }
      )
      cy.get('[data-testid="governor-contest-liberty-aaron-aligator"]').within(
        () => cy.contains('2')
      )
      cy.get('[data-testid="governor-contest-liberty-peter-pigeon"]').within(
        () => cy.contains('1')
      )
      cy.get('[data-testid="governor-contest-liberty-__write-in"]').within(() =>
        cy.contains('0')
      )
      cy.get('[data-testid="results-table-schoolboard-liberty').within(() => {
        cy.contains('5 ballots cast')
        cy.contains('4 overvotes')
        cy.contains('3 undervotes')
      })
      cy.get('[data-testid="schoolboard-liberty-amber-brkich"]').within(() =>
        cy.contains('2')
      )
      cy.get('[data-testid="schoolboard-liberty-chris-daugherty"]').within(() =>
        cy.contains('1')
      )
      cy.get('[data-testid="schoolboard-liberty-tom-westman"]').within(() =>
        cy.contains('0')
      )
      cy.get('[data-testid="schoolboard-liberty-danni-boatwright"]').within(
        () => cy.contains('0')
      )
      cy.get('[data-testid="schoolboard-liberty-__write-in"]').within(() =>
        cy.contains('0')
      )
    }
    const assertTallyReportHasEmptyTally = () => {
      cy.contains('Preview Report').click()
      cy.get('[data-testid="absentee"]').within(() => cy.contains('0'))
      cy.get('[data-testid="standard"]').within(() => cy.contains('0'))
      cy.get('[data-testid="total"]').within(() => cy.contains('0'))
      cy.get('[data-testid="results-table-governor-contest-liberty').within(
        () => {
          cy.contains('0 ballots cast')
          cy.contains('0 overvotes')
          cy.contains('0 undervotes')
        }
      )
      cy.get('[data-testid="governor-contest-liberty-aaron-aligator"]').within(
        () => cy.contains('0')
      )
      cy.get('[data-testid="governor-contest-liberty-peter-pigeon"]').within(
        () => cy.contains('0')
      )
      cy.get('[data-testid="governor-contest-liberty-__write-in"]').within(() =>
        cy.contains('0')
      )
      cy.get('[data-testid="results-table-schoolboard-liberty').within(() => {
        cy.contains('0 ballots cast')
        cy.contains('0 overvotes')
        cy.contains('0 undervotes')
      })
      cy.get('[data-testid="schoolboard-liberty-amber-brkich"]').within(() =>
        cy.contains('0')
      )
      cy.get('[data-testid="schoolboard-liberty-chris-daugherty"]').within(() =>
        cy.contains('0')
      )
      cy.get('[data-testid="schoolboard-liberty-tom-westman"]').within(() =>
        cy.contains('0')
      )
      cy.get('[data-testid="schoolboard-liberty-danni-boatwright"]').within(
        () => cy.contains('0')
      )
      cy.get('[data-testid="schoolboard-liberty-__write-in"]').within(() =>
        cy.contains('0')
      )
    }
    cy.contains('View Unofficial Full Election Tally Report').click()
    assertTallyReportHasFullTally()
    cy.contains('Back to Tally Index').click()
    cy.contains('View Unofficial Precinct 2 Tally Report').click()
    assertTallyReportHasFullTally()
    cy.contains('Back to Tally Index').click()
    cy.contains('View Unofficial Precinct 1 Tally Report').click()
    assertTallyReportHasEmptyTally()
    cy.contains('Back to Tally Index').click()
    cy.contains('View Unofficial Precinct 3 Tally Report').click()
    assertTallyReportHasEmptyTally()
    cy.contains('Back to Tally Index').click()
    cy.contains('View Unofficial Precinct 4 Tally Report').click()
    assertTallyReportHasEmptyTally()
    cy.contains('Back to Tally Index').click()
    cy.contains('View Unofficial Precinct 5 Tally Report').click()
    assertTallyReportHasEmptyTally()
    cy.contains('Back to Tally Index').click()
    cy.contains('View Unofficial Liberty Party Tally Report').click()
    assertTallyReportHasFullTally()
    cy.contains('Back to Tally Index').click()
    cy.contains('View Unofficial Scanner scanner-1 Tally Report').click()
    assertTallyReportHasFullTally()
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
