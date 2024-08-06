import { FujitsuPrinterStatus } from '../printing/printer';
import { testPrintFailureDiagnosticMessage } from './diagnostics';

test.each<{ printerStatus: FujitsuPrinterStatus; message: string }>([
  {
    printerStatus: { state: 'cover-open' },
    message:
      'The printer detected the roll holder was disconnected while printing.',
  },
  {
    printerStatus: { state: 'no-paper' },
    message:
      'The printer ran out of paper or the paper became misaligned while printing.',
  },
  {
    printerStatus: { state: 'error', type: 'disconnected' },
    message: 'The printer was disconnected while printing.',
  },
  {
    printerStatus: { state: 'error', type: 'temperature' },
    message: 'The printer overheated while printing.',
  },
  {
    printerStatus: { state: 'error', type: 'supply-voltage' },
    message: 'The printer detected a power supply problem while printing.',
  },
  {
    printerStatus: { state: 'error', type: 'receive-data' },
    message:
      'The printer experienced a data transmission error during printing.',
  },
  {
    printerStatus: { state: 'error', type: 'hardware' },
    message:
      'The printer experienced an unknown hardware error during printing.',
  },
])('$printerStatus', ({ printerStatus, message }) => {
  expect(testPrintFailureDiagnosticMessage(printerStatus)).toEqual(message);
});
