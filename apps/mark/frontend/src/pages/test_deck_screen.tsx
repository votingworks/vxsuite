import { useState } from 'react';
import {
  Button,
  H1,
  Icons,
  Loading,
  Main,
  P,
  Screen,
  SearchSelect,
} from '@votingworks/ui';
import { PrecinctId } from '@votingworks/types';
import { getElectionRecord, printTestDeck } from '../api';

export interface TestDeckScreenProps {
  onBackButtonPress: () => void;
}

export function TestDeckScreen({
  onBackButtonPress,
}: TestDeckScreenProps): JSX.Element {
  const [selectedPrecinctId, setSelectedPrecinctId] = useState<PrecinctId>();
  const [printingTestDeckType, setPrintingTestDeckType] = useState<
    'all' | 'precinct' | undefined
  >();

  const electionRecordQuery = getElectionRecord.useQuery();
  const printTestDeckMutation = printTestDeck.useMutation();

  if (!electionRecordQuery.isSuccess) {
    return (
      <Screen>
        <Main padded>
          <H1>Test Decks</H1>
          <Loading />
        </Main>
      </Screen>
    );
  }

  const { electionDefinition } = electionRecordQuery.data ?? {};
  const precincts = electionDefinition?.election.precincts ?? [];

  const printingInProgress = printTestDeckMutation.isLoading;

  const printingProgressIndicator = (
    <span>
      <Icons.Loading /> Printing...
    </span>
  );

  return (
    <Screen>
      <Main padded>
        <H1>Test Decks</H1>
        <P>
          <Button icon="Previous" variant="primary" onPress={onBackButtonPress}>
            Back
          </Button>
        </P>
        <P>
          <Button
            disabled={printingInProgress}
            onPress={() => {
              setPrintingTestDeckType('all');
              printTestDeckMutation.mutate(
                {},
                { onSettled: () => setPrintingTestDeckType(undefined) }
              );
            }}
          >
            {printingInProgress && printingTestDeckType === 'all'
              ? printingProgressIndicator
              : 'Print All Test Decks'}
          </Button>
        </P>
        <P>
          <SearchSelect
            aria-label="Select a precinct"
            isMulti={false}
            isSearchable
            options={precincts.map((precinct) => ({
              value: precinct.id,
              label: precinct.name,
            }))}
            placeholder="Select a precinct…"
            value={selectedPrecinctId}
            onChange={setSelectedPrecinctId}
            style={{ width: '100%' }}
            disabled={printingInProgress}
          />
        </P>
        <P>
          <Button
            disabled={!selectedPrecinctId || printingInProgress}
            onPress={() => {
              setPrintingTestDeckType('precinct');
              printTestDeckMutation.mutate(
                { precinctId: selectedPrecinctId },
                { onSettled: () => setPrintingTestDeckType(undefined) }
              );
            }}
          >
            {printingInProgress && printingTestDeckType === 'precinct'
              ? printingProgressIndicator
              : 'Print Precinct Test Deck'}
          </Button>
        </P>
      </Main>
    </Screen>
  );
}
