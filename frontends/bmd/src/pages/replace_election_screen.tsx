import { ElectionDefinition, Optional } from '@votingworks/types';
import {
  Button,
  Main,
  Prose,
  Screen,
  Text,
  useCancelablePromise,
} from '@votingworks/ui';
import { formatLongDate } from '@votingworks/utils';
import { DateTime } from 'luxon';
import pluralize from 'pluralize';
import React, { useEffect, useState } from 'react';
import { ElectionInfo } from '../components/election_info';
import { Sidebar } from '../components/sidebar';
import { VersionsData } from '../components/versions_data';
import {
  MachineConfig,
  PrecinctSelection,
  ScreenReader,
} from '../config/types';

interface Props {
  appPrecinct?: PrecinctSelection;
  ballotsPrintedCount: number;
  electionDefinition: ElectionDefinition;
  getElectionDefinitionFromCard(): Promise<Optional<ElectionDefinition>>;
  machineConfig: MachineConfig;
  screenReader: ScreenReader;
  unconfigure(): Promise<void>;
}

function BriefElectionDefinitionInfo({
  electionDefinition,
}: {
  electionDefinition: ElectionDefinition;
}) {
  const { election, electionHash } = electionDefinition;
  const displayElectionHash = electionHash.slice(0, 10);
  return (
    <ul>
      <li>
        <strong>Title:</strong> {election.title}
      </li>
      <li>
        <strong>County:</strong> {election.county.name}
      </li>
      <li>
        <strong>Date:</strong> {formatLongDate(DateTime.fromISO(election.date))}
      </li>
      <li>
        <strong>Election ID:</strong> {displayElectionHash}
      </li>
    </ul>
  );
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

  return (
    <Screen navLeft>
      <Main padded>
        <Prose id="audiofocus">
          <h1>Admin Card is not configured for this election</h1>
          {!cardElectionDefinition ? (
            <p>Reading Election Definition from Admin Card…</p>
          ) : (
            <React.Fragment>
              <p>
                You may replace the Election Definition on this machine with the
                one from the Admin Card. Doing so will replace all data on this
                machine.
              </p>
              <h3>Current Election Definition:</h3>
              <BriefElectionDefinitionInfo
                electionDefinition={electionDefinition}
              />
              <h3> Card Election Definition: </h3>
              <BriefElectionDefinitionInfo
                electionDefinition={cardElectionDefinition}
              />
              {ballotsPrintedCount === 0 ? (
                <Text>No ballots have been printed yet.</Text>
              ) : (
                <Text>
                  This machine has already printed{' '}
                  {pluralize('ballot', ballotsPrintedCount, true)}.
                </Text>
              )}
              <p>
                <Button danger onPress={unconfigure}>
                  Remove Current Election and All Data
                </Button>
              </p>
            </React.Fragment>
          )}
        </Prose>
      </Main>
      <Sidebar
        appName={machineConfig.appMode.productName}
        centerContent
        title="Replace Election"
        footer={
          <React.Fragment>
            <ElectionInfo
              electionDefinition={electionDefinition}
              precinctSelection={appPrecinct}
              horizontal
            />
            <VersionsData
              machineConfig={machineConfig}
              electionHash={electionDefinition.electionHash}
            />
          </React.Fragment>
        }
      >
        <Prose>
          <h2>Instructions</h2>
          <p>
            Loading an election definition from the Admin Card will reset all
            data on this device.
          </p>
          <p>Remove Admin Card to cancel.</p>
        </Prose>
      </Sidebar>
    </Screen>
  );
}
