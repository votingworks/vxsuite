import { PageInterpretationType } from '@votingworks/types';

export class UnknownInterpretationDiagnosticError extends Error {
  constructor(interpretationType: PageInterpretationType) {
    super(`Unexpected test ballot interpretation: ${interpretationType}`);
  }
}
