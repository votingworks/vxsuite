import { CompletedBallot } from '@votingworks/ballot-encoder'
import ballotToDocument from '@votingworks/ballot-renderer/renderers/ballotToDocument'
import { Printer, PrintType } from './printer'

/**
 * Prints the ballot to PDF if possible, otherwise prints the current page.
 * This assumes that printing the current page will print the ballot, which must
 * be set up before this is called.
 */
export default async function printBallotOrCurrentPage(
  printer: Printer,
  ballot: CompletedBallot
): Promise<void> {
  if (await printer.canPrint(PrintType.PDFMakeDocument)) {
    const document = ballotToDocument(ballot)

    await printer.print({ type: PrintType.PDFMakeDocument, pdf: document })
  } else {
    await printer.print({ type: PrintType.CurrentPage })
  }
}
