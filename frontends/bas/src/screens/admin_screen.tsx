import React from 'react';
import pluralize from 'pluralize';
import { DateTime } from 'luxon';

import {
  BallotStyle,
  OptionalElection,
  PartyId,
  PartyIdSchema,
  PrecinctId,
  unsafeParse,
} from '@votingworks/types';
import { formatFullDateTimeZone } from '@votingworks/utils';

import { Main, MainChild, Screen } from '@votingworks/ui';

import { compareName } from '../utils/sort';
import { Button } from '../components/button';
import { Prose } from '../components/prose';
import { MainNav } from '../components/main_nav';
import { Select } from '../components/select';
import { Text } from '../components/text';

interface Props {
  election: OptionalElection;
  fetchElection: () => void;
  getBallotStylesByPrecinctId: (id?: PrecinctId) => BallotStyle[];
  isLoadingElection: boolean;
  partyId?: PartyId;
  partyName?: string;
  precinctId?: PrecinctId;
  precinctName?: string;
  setParty: (id?: PartyId) => void;
  setPrecinct: (id: string) => void;
  unconfigure: () => void;
  isSinglePrecinctMode: boolean;
  setIsSinglePrecinctMode: (enabled: boolean) => void;
  precinctBallotStyles: BallotStyle[];
}

export function AdminScreen({
  election,
  fetchElection,
  getBallotStylesByPrecinctId,
  isLoadingElection,
  isSinglePrecinctMode,
  partyId,
  partyName,
  precinctId,
  precinctName,
  precinctBallotStyles,
  setParty,
  setPrecinct,
  setIsSinglePrecinctMode,
  unconfigure,
}: Props): JSX.Element {
  const precincts = election ? [...election.precincts].sort(compareName) : [];
  const parties = election ? [...election.parties].sort(compareName) : [];
  function onChangeParty(event: React.FormEvent<HTMLSelectElement>) {
    setParty(unsafeParse(PartyIdSchema, event.currentTarget.value));
  }
  function onChangePrecinct(event: React.FormEvent<HTMLSelectElement>) {
    const { value } = event.currentTarget;
    setPrecinct(value);
    setIsSinglePrecinctMode(!!value);
  }
  function reset() {
    setPrecinct('');
    setParty(undefined);
    setIsSinglePrecinctMode(false);
  }
  const ballotStyles = partyId
    ? precinctBallotStyles.filter((bs) => bs.partyId === partyId)
    : precinctBallotStyles;
  const ballotStylesCount = ballotStyles.length;
  const ballotStylesIds = ballotStyles.map((bs) => bs.id).join(', ');
  return (
    <Screen flexDirection="column">
      <Main>
        <MainChild>
          <Prose>
            <p>Remove card when finished making changes.</p>
            {election && (
              <React.Fragment>
                <h1>Single Precinct Mode</h1>
                <p>Select a precinct. Optionally, select a party.</p>
                <Select
                  small
                  block={false}
                  value={precinctId}
                  onChange={onChangePrecinct}
                  onBlur={onChangePrecinct}
                >
                  <option value="">All precincts</option>
                  {precincts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({getBallotStylesByPrecinctId(p.id).length})
                    </option>
                  ))}
                </Select>{' '}
                <Select
                  small
                  block={false}
                  disabled={!precinctId}
                  value={partyId}
                  onChange={onChangeParty}
                  onBlur={onChangeParty}
                >
                  <option value="">All parties</option>
                  {parties.map((p) => {
                    const partyLength = precinctBallotStyles.filter(
                      (bs) => bs.partyId === p.id
                    ).length;
                    return (
                      <option key={p.id} value={p.id} disabled={!partyLength}>
                        {p.name} ({partyLength})
                      </option>
                    );
                  })}
                </Select>{' '}
                <Button small disabled={!precinctId} onPress={reset}>
                  Reset
                </Button>
                {isSinglePrecinctMode ? (
                  <p>
                    {`${precinctName} has ${ballotStylesCount} ballot ${pluralize(
                      'style',
                      ballotStylesCount
                    )}${
                      partyName && ` for the ${partyName} party`
                    }: ${ballotStylesIds}.`}
                  </p>
                ) : (
                  <p>
                    <em>Single Precinct Mode is disabled.</em>
                  </p>
                )}
                <h1>Current Date and Time</h1>
                <p>
                  {formatFullDateTimeZone(DateTime.now(), {
                    includeTimezone: true,
                  })}
                </p>
              </React.Fragment>
            )}
            <h1>Configuration</h1>
            {isLoadingElection ? (
              <p>Loading Election Definition from Admin Card…</p>
            ) : election ? (
              <p>
                <Text as="span" voteIcon>
                  Election definition is loaded.
                </Text>{' '}
                <Button danger small onPress={unconfigure}>
                  Unconfigure Machine
                </Button>
              </p>
            ) : (
              <React.Fragment>
                <Text warningIcon>Election definition is not Loaded.</Text>
                <p>
                  <Button onPress={fetchElection}>
                    Load Election Definition
                  </Button>
                </p>
              </React.Fragment>
            )}
          </Prose>
        </MainChild>
      </Main>
      <MainNav title="Admin Actions" />
    </Screen>
  );
}
