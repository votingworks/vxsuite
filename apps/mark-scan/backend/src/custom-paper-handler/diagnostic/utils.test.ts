import { join } from 'path';
import { assertDefined } from '@votingworks/basics';
import { getPaperHandlerDiagnosticElectionDefinition } from './utils';

describe('getPaperHandlerDiagnosticElectionDefinition', () => {
  test('returns an error if file reading fails', async () => {
    const path = join(__dirname, 'does-not-exist.pdf');
    const result = await getPaperHandlerDiagnosticElectionDefinition(path);
    expect(result.isErr()).toEqual(true);
    expect(assertDefined(result.err()).message).toEqual(
      `Failed to read election file at ${path}`
    );
  });
});
