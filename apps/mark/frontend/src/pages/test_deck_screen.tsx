import { useState } from 'react';
import {
  Button,
  H1,
  Loading,
  Main,
  P,
  Screen,
  SearchSelect,
} from '@votingworks/ui';
import { PrecinctId } from '@votingworks/types';
import { getElectionRecord } from '../api';

export interface TestDeckScreenProps {
  onBackButtonPress: () => void;
}

export function TestDeckScreen({
  onBackButtonPress,
}: TestDeckScreenProps): JSX.Element {
  const [selectedPrecinctId, setSelectedPrecinctId] = useState<PrecinctId>();

  const electionRecordQuery = getElectionRecord.useQuery();

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
          <Button onPress={() => {}}>Print All Test Decks</Button>
        </P>
        <P>
          <SearchSelect
            aria-label="Select a precinct…"
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
          />
        </P>
        <P>
          <Button disabled={!selectedPrecinctId} onPress={() => {}}>
            Print Precinct Test Deck
          </Button>
        </P>
      </Main>
    </Screen>
  );
}
