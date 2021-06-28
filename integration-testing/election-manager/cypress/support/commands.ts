// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
import 'cypress-file-upload'

interface SingleSEMsResultInfo {
  precinctId: string
  contestId: string
  candidateId: string
  numberOfVotes: number
}

Cypress.Commands.add(
  'assertExpectedResultsMatchSEMsFile',
  (expectedResults: SingleSEMsResultInfo[], semsFileContent: string): void => {
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
)
