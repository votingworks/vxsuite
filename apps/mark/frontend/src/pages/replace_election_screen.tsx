import { ElectionDefinition, PrecinctSelection } from '@votingworks/types';
import {
  ElectionInfoBar,
  Main,
  Prose,
  Screen,
  Table,
  Text,
} from '@votingworks/ui';
import { formatLongDate } from '@votingworks/utils';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { MachineConfig } from '@votingworks/mark-backend';
import { DateTime } from 'luxon';
import pluralize from 'pluralize';
import React, { useEffect } from 'react';
import { ScreenReader } from '../config/types';

export interface ReplaceElectionScreenProps {
  appPrecinct?: PrecinctSelection;
  ballotsPrintedCount: number;
  authElectionHash: string;
  electionDefinition: ElectionDefinition;
  machineConfig: MachineConfig;
  screenReader: ScreenReader;
  isLoading: boolean;
  isError: boolean;
}

export function ReplaceElectionScreen({
  appPrecinct,
  ballotsPrintedCount,
  authElectionHash,
  electionDefinition,
  machineConfig,
  screenReader,
  isLoading,
  isError,
}: ReplaceElectionScreenProps): JSX.Element {
  const { election, electionHash } = electionDefinition;

  useEffect(() => {
    const muted = screenReader.isMuted();
    screenReader.mute();
    return () => screenReader.toggleMuted(muted);
  }, [screenReader]);

  if (isLoading) {
    return (
      <Screen>
        <Main padded centerChild>
          <Prose textCenter>
            <p>Unconfiguring election on machine…</p>
          </Prose>
        </Main>
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <Main padded centerChild>
          <Prose textCenter>
            <p>Error unconfiguring the machine.</p>
            <p>Remove card to continue.</p>
          </Prose>
        </Main>
      </Screen>
    );
  }

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
              </tr>
              <tr>
                <th>County</th>
                <td>{election.county.name}</td>
              </tr>
              <tr>
                <th>Date</th>
                <td>{formatLongDate(DateTime.fromISO(election.date))}</td>
              </tr>
              <tr>
                <th>Election ID</th>
                <td>{electionHash.slice(0, 10)}</td>
                <td>{authElectionHash.slice(0, 10)}</td>
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
