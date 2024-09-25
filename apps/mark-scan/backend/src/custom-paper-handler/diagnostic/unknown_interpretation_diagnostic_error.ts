import { PageInterpretationType } from '@votingworks/types';
import { DiagnosticError } from './diagnostic_error';

export class UnknownInterpretationDiagnosticError extends DiagnosticError {
  constructor(interpretationType: PageInterpretationType) {
    super(`Unexpected test ballot interpretation: ${interpretationType}`);
  }
}
