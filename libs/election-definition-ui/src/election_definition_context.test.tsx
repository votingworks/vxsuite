import { expect, test } from 'vitest';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { render } from '../test/react_testing_library.js';
import { useElectionDefinitionApi } from './election_definition_context.js';

function ApiUser(): JSX.Element {
  useElectionDefinitionApi();
  return <div />;
}

test('useElectionDefinitionApi requires a provider', () => {
  suppressingConsoleOutput(() => {
    expect(() => render(<ApiUser />)).toThrow(
      'the ElectionDefinition API was not provided'
    );
  });
});
