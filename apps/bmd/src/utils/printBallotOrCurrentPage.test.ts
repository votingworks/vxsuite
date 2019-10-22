import {
  electionSample,
  BallotType,
  vote,
  CompletedBallot,
} from '@votingworks/ballot-encoder'
import { Printer, PrintType } from './printer'
import printBallotOrCurrentPage from './printBallotOrCurrentPage'

function testBallot(): CompletedBallot {
  return {
    ballotId: 'ballot-id',
    ballotStyle: electionSample.ballotStyles[0],
    ballotType: BallotType.Standard,
    election: electionSample,
    isTestBallot: true,
    precinct: electionSample.precincts[0],
    votes: vote([], {}),
  }
}

test('prints a PDF document if possible', async () => {
  const printer: Printer = {
    canPrint: jest.fn().mockResolvedValueOnce(true),
    getStatus: jest.fn(),
    print: jest.fn(),
  }

  await printBallotOrCurrentPage(printer, testBallot())

  expect(printer.print).toHaveBeenCalledWith(
    expect.objectContaining({ type: PrintType.PDFMakeDocument })
  )
})

test('prints the current page if PDF printing is not possible', async () => {
  const printer: Printer = {
    canPrint: jest
      .fn()
      .mockImplementation(
        async (type: PrintType) => type === PrintType.CurrentPage
      ),
    getStatus: jest.fn(),
    print: jest.fn(),
  }

  await printBallotOrCurrentPage(printer, testBallot())

  expect(printer.print).toHaveBeenCalledWith(
    expect.objectContaining({ type: PrintType.CurrentPage })
  )
})
