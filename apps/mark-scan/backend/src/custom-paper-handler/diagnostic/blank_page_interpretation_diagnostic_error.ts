export class BlankPageInterpretationDiagnosticError extends Error {
  constructor() {
    super(
      'No ballot QR code was detected on the page after printing. Ensure the page is inserted with the printable side up and try again.'
    );
  }
}
