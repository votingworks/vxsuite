import {
  Election,
  expandEitherNeitherContests,
  writeInCandidate,
} from '@votingworks/types'
import { format } from '@votingworks/utils'
import { FullElectionTally, TallyCategory } from '../config/types'
import { filterTalliesByParamsAndBatchId } from '../lib/votecounting'

export function* generateRowsForBatchTallyResultsCSV(
  fullElectionTally: FullElectionTally,
  election: Election
): Generator<string> {
  const batchResults = fullElectionTally.resultsByCategory.get(
    TallyCategory.Batch
  )!
  for (const batchId of Object.keys(batchResults)) {
    const batchTally = filterTalliesByParamsAndBatchId(
      fullElectionTally,
      election,
      batchId,
      {}
    )
    const contestVoteTotals: string[] = []
    expandEitherNeitherContests(election.contests).forEach((contest) => {
      const contestTally = batchTally.contestTallies[contest.id]
      contestVoteTotals.push(format.count(contestTally?.metadata.ballots ?? 0))
      contestVoteTotals.push(
        format.count(contestTally?.metadata.undervotes ?? 0)
      )
      contestVoteTotals.push(
        format.count(contestTally?.metadata.overvotes ?? 0)
      )
      if (contest.type === 'candidate') {
        contest.candidates.forEach((candidate) => {
          contestVoteTotals.push(
            format.count(contestTally?.tallies[candidate.id]?.tally ?? 0)
          )
        })
        if (contest.allowWriteIns) {
          contestVoteTotals.push(
            format.count(contestTally?.tallies[writeInCandidate.id]?.tally ?? 0)
          )
        }
      } else if (contest.type === 'yesno') {
        contestVoteTotals.push(
          format.count(contestTally?.tallies.yes?.tally ?? 0)
        )
        contestVoteTotals.push(
          format.count(contestTally?.tallies.no?.tally ?? 0)
        )
      }
    })
    const row = [
      batchId,
      batchTally.batchLabel,
      batchTally.scannerIds.join(', '),
      batchTally.numberOfBallotsCounted,
      ...contestVoteTotals,
    ]
    yield row.join(',')
  }
}

export function generateHeaderRowForBatchResultsCSV(
  election: Election
): string {
  const contestSelectionHeaders: string[] = []
  expandEitherNeitherContests(election.contests).forEach((contest) => {
    let contestTitle = contest.title
    if (contest.partyId) {
      const party = election.parties.find((p) => p.id === contest.partyId)
      if (party) {
        contestTitle = `${party.fullName} ${contestTitle}`
      }
    }
    contestTitle = contestTitle.replace(/[^a-z0-9 _-]+/gi, ' ').trim()
    contestSelectionHeaders.push(`${contestTitle} - Ballots Cast`)
    contestSelectionHeaders.push(`${contestTitle} - Undervotes`)
    contestSelectionHeaders.push(`${contestTitle} - Overvotes`)
    if (contest.type === 'candidate') {
      contest.candidates.forEach((candidate) => {
        contestSelectionHeaders.push(`${contestTitle} - ${candidate.name}`)
      })
      if (contest.allowWriteIns) {
        contestSelectionHeaders.push(`${contestTitle} - Write In`)
      }
    } else if (contest.type === 'yesno') {
      contestSelectionHeaders.push(`${contestTitle} - Yes`)
      contestSelectionHeaders.push(`${contestTitle} - No`)
    }
  })
  const headers = [
    'Batch ID',
    'Batch Name',
    'Tabulator',
    'Number of Ballots',
    ...contestSelectionHeaders,
  ]
  return headers.join(',')
}

/**
 *
 * Converts a tally for an election to a CSV file (represented as a string) of tally results
 * broken down by scanning batch.
 * @param fullElectionTally A tally for an election
 * @param election The election schema for the associated tally
 * @returns string file content for a CSV file with tally results broken down by scanning batch
 * CSV File format:
 * One row for every batch, in addition to a headers row.
 * Columns for every possible contest selection in every contest.
 * | Batch ID | Batch Name | Tabulator | Number Of Ballots | Contest 1 - Ballots Cast | Contest 1 - Undervotes | Contest 1 - Overvotes | Contest 1 - Selection Option 1 | ... | Contest N - Selection Option M |
 */
export default function generateBatchTallyResultsCSV(
  fullElectionTally: FullElectionTally,
  election: Election
): string {
  let finalDataString = generateHeaderRowForBatchResultsCSV(election)
  for (const rowCSVString of generateRowsForBatchTallyResultsCSV(
    fullElectionTally,
    election
  )) {
    finalDataString += `\n${rowCSVString}`
  }

  return finalDataString
}
