import { Printer, renderToPdf } from '@votingworks/printing';

export async function renderAndPrintReceipt(
  printer: Printer,
  receipt: JSX.Element
): Promise<void> {
  const receiptPdf = (
    await renderToPdf({
      document: receipt,
      paperDimensions: {
        width: 2.83,
        height: 7,
      },
      marginDimensions: {
        top: 0.1,
        right: 0.1,
        bottom: 0.1,
        left: 0.1,
      },
    })
  ).unsafeUnwrap();
  await printer.print({ data: receiptPdf });
}
