import { expect, test, vi } from 'vitest';
import React from 'react';
import { QUERY_CLIENT_DEFAULT_OPTIONS } from '@votingworks/ui';
import { Election, ElectionDefinition } from '@votingworks/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { generateBallotStyleId } from '@votingworks/utils';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { useBallotStyleManager } from '..';
import { act, renderHook } from '../../test/react_testing_library';

const electionGeneralDefinition = readElectionGeneralDefinition();

let setMockLanguage: (languageCode: string) => void;
function useCurrentLanguageMock() {
  const [language, setLanguage] = React.useState('en');

  setMockLanguage = (l) => setLanguage(l);

  return language;
}

vi.mock('@votingworks/ui', async () => ({
  ...(await vi.importActual('@votingworks/ui')),
  useCurrentLanguage: useCurrentLanguageMock,
}));

const queryClient = new QueryClient({
  defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS,
});

function TestHookWrapper(props: { children: React.ReactNode }) {
  return <QueryClientProvider {...props} client={queryClient} />;
}

const baseElection = electionGeneralDefinition.election;

const ballotLanguages = ['en', 'es-US'];
const [ballotStyleEnglish, ballotStyleSpanish] = ballotLanguages.map(
  (languageCode) => ({
    ...baseElection.ballotStyles[0],
    id: generateBallotStyleId({
      ballotStyleIndex: 1,
      languages: [languageCode],
    }),
    languages: [languageCode],
  })
);

const election: Election = {
  ...baseElection,
  ballotStyles: [ballotStyleEnglish, ballotStyleSpanish],
};
const electionDefinition: ElectionDefinition = {
  ...electionGeneralDefinition,
  election,
};

test('updates ballot style when language changes', () => {
  const mockUpdateFn = vi.fn();

  renderHook(
    () =>
      useBallotStyleManager({
        currentBallotStyleId: ballotStyleEnglish.id,
        electionDefinition,
        updateCardlessVoterBallotStyle: mockUpdateFn,
      }),
    { wrapper: TestHookWrapper }
  );

  mockUpdateFn.mockClear();
  act(() => setMockLanguage('es-US'));

  expect(mockUpdateFn).toHaveBeenCalledTimes(1);
  expect(mockUpdateFn).toHaveBeenCalledWith({
    ballotStyleId: ballotStyleSpanish.id,
  });
});

test('is a no-op for unchanged language', () => {
  const mockUpdateFn = vi.fn();

  renderHook(
    () =>
      useBallotStyleManager({
        currentBallotStyleId: ballotStyleEnglish.id,
        electionDefinition,
        updateCardlessVoterBallotStyle: mockUpdateFn,
      }),
    { wrapper: TestHookWrapper }
  );

  mockUpdateFn.mockClear();
  act(() => setMockLanguage('en'));

  expect(mockUpdateFn).not.toHaveBeenCalled();
});

test('is a no-op for undefined initial ballot style ID', () => {
  const mockUpdateFn = vi.fn();

  renderHook(
    () =>
      useBallotStyleManager({
        electionDefinition,
        updateCardlessVoterBallotStyle: mockUpdateFn,
      }),
    { wrapper: TestHookWrapper }
  );

  act(() => setMockLanguage('es-US'));

  expect(mockUpdateFn).not.toHaveBeenCalled();
});

test('is a no-op for undefined election definition', () => {
  const mockUpdateFn = vi.fn();

  renderHook(
    () =>
      useBallotStyleManager({
        currentBallotStyleId: ballotStyleEnglish.id,
        updateCardlessVoterBallotStyle: mockUpdateFn,
      }),
    { wrapper: TestHookWrapper }
  );

  act(() => setMockLanguage('es-US'));

  expect(mockUpdateFn).not.toHaveBeenCalled();
});
