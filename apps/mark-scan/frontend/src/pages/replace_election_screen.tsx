import { ElectionDefinition, PrecinctSelection } from '@votingworks/types';
import {
  ElectionInfoBar,
  H2,
  Main,
  Prose,
  Screen,
  Table,
  P,
  H1,
  Icons,
} from '@votingworks/ui';
import { formatLongDate } from '@votingworks/utils';
import type { MachineConfig } from '@votingworks/mark-scan-backend';
import { DateTime } from 'luxon';
import pluralize from 'pluralize';
import { useEffect } from 'react';
import { Optional } from '@votingworks/basics';
import { ScreenReader } from '../config/types';
import { getPrecinctSelection } from '../api';

export interface ReplaceElectionScreenProps {
  ballotsPrintedCount: number;
  authElectionHash: string;
  electionDefinition: ElectionDefinition;
  machineConfig: MachineConfig;
  screenReader: ScreenReader;
  isLoading: boolean;
  isError: boolean;
}

export function ReplaceElectionScreen({
  ballotsPrintedCount,
  authElectionHash,
  electionDefinition,
  machineConfig,
  screenReader,
  isLoading,
  isError,
}: ReplaceElectionScreenProps): JSX.Element | null {
  const getPrecinctSelectionQuery = getPrecinctSelection.useQuery();
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
            <P>Unconfiguring election on machine…</P>
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
            <P>Error unconfiguring the machine.</P>
            <P>Remove card to continue.</P>
          </Prose>
        </Main>
      </Screen>
    );
  }

  if (!getPrecinctSelectionQuery.isSuccess) {
    return null;
  }
  const precinctSelection: Optional<PrecinctSelection> =
    getPrecinctSelectionQuery.data || undefined;

  return (
    <Screen>
      <Main padded centerChild>
        <Prose id="audiofocus">
          <H1 color="danger">
            <Icons.Danger /> This card is configured for a different election.
          </H1>
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
            <P>
              This machine has not printed any ballots for the current election.
            </P>
          ) : (
            <P>
              This machine has printed{' '}
              <strong>{pluralize('ballot', ballotsPrintedCount, true)}</strong>{' '}
              for the current election.
            </P>
          )}
          <H2>Cancel and Go Back</H2>
          <P>Remove the inserted card to cancel.</P>
        </Prose>
      </Main>
      {election && (
        <ElectionInfoBar
          mode="admin"
          electionDefinition={electionDefinition}
          codeVersion={machineConfig.codeVersion}
          machineId={machineConfig.machineId}
          precinctSelection={precinctSelection}
        />
      )}
    </Screen>
  );
}
