import { DiagnosticError } from './diagnostic_error';

export class BlankPageInterpretationDiagnosticError extends DiagnosticError {
  constructor() {
    super(
      'No ballot QR code was detected on the page after printing. Ensure the page is inserted with the printable side up and try again.'
    );
  }
}
