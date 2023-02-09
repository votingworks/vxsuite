import { CandidateId, ContestId, Dictionary, PrecinctId } from '@votingworks/types'

export interface SingleSEMsResultInfo {
  precinctId: PrecinctId
  contestId: ContestId
  candidateId: CandidateId
  numberOfVotes: number
}

// Assert that the sems file content matches the expected tally results.
// Unspecified contests or candidates in contests ARE checked to have a tally of 0.
export function assertExpectedResultsMatchSEMsFile(
  expectedResults: SingleSEMsResultInfo[],
  semsFileContent: string
): void {
  const resultRows = semsFileContent
    .split('\r\n')
    .map((r) => r.replace('\n', ': '))
    .filter((r) => r !== '') // remove any empty lines
  resultRows.forEach((row) => {
    const entries = row
      .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
      .map((e) => e.replace(/['"`]/g, '').trim())
    const rowPrecinctId = entries[1]
    const rowContestId = entries[2]
    const rowCandidateId = entries[6]
    const expectedNumberOfVotes =
      expectedResults.find(
        (info) =>
          rowPrecinctId === info.precinctId &&
          rowContestId === info.contestId &&
          rowCandidateId === info.candidateId
      )?.numberOfVotes ?? 0
    expect(
      entries[10],
      `results for precinct: ${rowPrecinctId} contest: ${rowContestId} candidate: ${rowCandidateId}`
    ).to.eqls(JSON.stringify(expectedNumberOfVotes))
  })
}

export interface ExpectedContestResults {
  contestId: ContestId
  metadata: { ballots: number; undervotes: number; overvotes: number }
  votesByOptionId: Dictionary<number>
}

export interface ExpectedSummaryData {
  hide?: boolean // Do not check summary data, there is none when view Absentee or Precinct only reports
  absentee?: number
  precinct?: number
}

// Assert that the current tally report screen matches the expected tally results.
// Unspecified contests or candidates in contests are NOT checked for any particular result.
export function assertExpectedResultsMatchTallyReport(
  expectedContestResults: ExpectedContestResults[], // {Contest-Id: {Candidate-Id: Number of Votes}}
  summaryData: ExpectedSummaryData
): void {
  if (!summaryData.hide) {
    const expectedAbsenteeVotes = summaryData.absentee ?? 0
    const expectedPrecinctVotes = summaryData.precinct ?? 0
    cy.get('[data-testid="absentee"]').within(() =>
      cy.contains(expectedAbsenteeVotes)
    )
    cy.get('[data-testid="standard"]').within(() =>
      cy.contains(expectedPrecinctVotes)
    )
    cy.get('[data-testid="total"]').within(() =>
      cy.contains(expectedPrecinctVotes + expectedAbsenteeVotes)
    )
  }
  for (const expectedContestResult of expectedContestResults) {
    const { ballots, undervotes, overvotes } = expectedContestResult.metadata
    cy.get(
      `[data-testid="results-table-${expectedContestResult.contestId}`
    ).within(() => {
      cy.contains(`${ballots} ballot`)
      cy.contains(`${overvotes} overvote`)
      cy.contains(`${undervotes} undervote`)
    })
    for (const [optionId, numberOfVotes] of Object.entries(
      expectedContestResult.votesByOptionId
    )) {
      cy.get(
        `[data-testid="${expectedContestResult.contestId}-${optionId}"]`
      ).within(() => cy.contains(numberOfVotes!))
    }
  }
}
