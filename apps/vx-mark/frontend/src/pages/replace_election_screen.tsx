import {
  ElectionDefinition,
  Optional,
  PrecinctSelection,
} from '@votingworks/types';
import {
  Button,
  ElectionInfoBar,
  Main,
  Prose,
  Screen,
  Table,
  Text,
  useCancelablePromise,
} from '@votingworks/ui';
import { formatLongDate } from '@votingworks/utils';
import { DateTime } from 'luxon';
import pluralize from 'pluralize';
import React, { useEffect, useState } from 'react';
import { MachineConfig, ScreenReader } from '../config/types';

interface Props {
  appPrecinct?: PrecinctSelection;
  ballotsPrintedCount: number;
  electionDefinition: ElectionDefinition;
  getElectionDefinitionFromCard(): Promise<Optional<ElectionDefinition>>;
  machineConfig: MachineConfig;
  screenReader: ScreenReader;
  unconfigure(): Promise<void>;
}

export function ReplaceElectionScreen({
  appPrecinct,
  ballotsPrintedCount,
  electionDefinition,
  getElectionDefinitionFromCard,
  machineConfig,
  screenReader,
  unconfigure,
}: Props): JSX.Element {
  const { election, electionHash } = electionDefinition;
  const makeCancelable = useCancelablePromise();
  const [cardElectionDefinition, setCardElectionDefinition] =
    useState<ElectionDefinition>();

  useEffect(() => {
    void (async () => {
      setCardElectionDefinition(
        await makeCancelable(getElectionDefinitionFromCard())
      );
    })();
  }, [getElectionDefinitionFromCard, makeCancelable]);

  useEffect(() => {
    const muted = screenReader.isMuted();
    screenReader.mute();
    return () => screenReader.toggleMuted(muted);
  }, [screenReader]);

  if (!cardElectionDefinition) {
    return (
      <Screen>
        <Main padded centerChild>
          <Prose>
            <p>Reading the election definition from Election Manager card…</p>
          </Prose>
        </Main>
      </Screen>
    );
  }

  const { election: cardElection, electionHash: cardElectionHash } =
    cardElectionDefinition;
  return (
    <Screen>
      <Main padded centerChild>
        <Prose id="audiofocus">
          <Text as="h1" error>
            This card is configured for a different election.
          </Text>
          <Table>
            <thead>
              <tr>
                <th />
                <th>Current Election</th>
                <th>Election on Card</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Title</th>
                <td>{election.title}</td>
                <td>{cardElection.title}</td>
              </tr>
              <tr>
                <th>County</th>
                <td>{election.county.name}</td>
                <td>{cardElection.county.name}</td>
              </tr>
              <tr>
                <th>Date</th>
                <td>{formatLongDate(DateTime.fromISO(election.date))}</td>
                <td>{formatLongDate(DateTime.fromISO(cardElection.date))}</td>
              </tr>
              <tr>
                <th>Election ID</th>
                <td>{electionHash.slice(0, 10)}</td>
                <td>{cardElectionHash.slice(0, 10)}</td>
              </tr>
              <tr>
                <th>Ballots Printed</th>
                <td>{ballotsPrintedCount}</td>
                <td>—</td>
              </tr>
            </tbody>
          </Table>
          {ballotsPrintedCount === 0 ? (
            <p>
              This machine has not printed any ballots for the current election.
            </p>
          ) : (
            <p>
              This machine has printed{' '}
              <strong>{pluralize('ballot', ballotsPrintedCount, true)}</strong>{' '}
              for the current election.
            </p>
          )}
          <h2>Cancel and Go Back</h2>
          <p>Remove the inserted card to cancel.</p>
          <h2>Remove the Current Election</h2>
          <p>
            You may remove the current election on this machine and then replace
            it with the election on the card.
          </p>
          <p>
            Removing the current election will replace all data on this machine.
          </p>
          <p>
            <Button danger small onPress={unconfigure}>
              Remove the Current Election and All Data
            </Button>
          </p>
        </Prose>
      </Main>
      {election && (
        <ElectionInfoBar
          mode="admin"
          electionDefinition={electionDefinition}
          codeVersion={machineConfig.codeVersion}
          machineId={machineConfig.machineId}
          precinctSelection={appPrecinct}
        />
      )}
    </Screen>
  );
}
