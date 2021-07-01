export interface SingleSEMsResultInfo {
  precinctId: string
  contestId: string
  candidateId: string
  numberOfVotes: number
}

export function assertExpectedResultsMatchSEMsFile(expectedResults: SingleSEMsResultInfo[], semsFileContent: string): void {
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
