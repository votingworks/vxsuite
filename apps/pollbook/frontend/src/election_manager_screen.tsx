import {
  Button,
  Card,
  colorThemes,
  Font,
  H2,
  H4,
  Icons,
  Loading,
  MainContent,
  P,
  Seal,
  SegmentedButton,
  UnconfigureMachineButton,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { Redirect, Route, Switch } from 'react-router-dom';
import React, { useState } from 'react';
import { safeParseInt } from '@votingworks/types';
import {
  Chart as ChartJS,
  TimeScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import styled from 'styled-components';
import { ElectionManagerNavScreen, electionManagerRoutes } from './nav_screen';
import {
  getElection,
  getIsAbsenteeMode,
  getSummaryStatistics,
  getThroughputStatistics,
  setIsAbsenteeMode,
  unconfigure,
  undoVoterCheckIn,
} from './api';
import { Column, Row } from './layout';
import { CheckInDetails, VoterSearch } from './voter_search_screen';
import { TitledCard } from './shared_components';

ChartJS.register(TimeScale, LinearScale, BarElement, Title, Tooltip, Legend);
ChartJS.defaults.font.size = 16;

export function ElectionScreen(): JSX.Element {
  const getElectionQuery = getElection.useQuery();
  assert(getElectionQuery.isSuccess);
  const election = getElectionQuery.data.unsafeUnwrap();

  const unconfigureMutation = unconfigure.useMutation();

  return (
    <ElectionManagerNavScreen title="Election">
      <MainContent>
        <Column style={{ gap: '1rem' }}>
          <Card color="neutral">
            <Row style={{ gap: '1rem', alignItems: 'center' }}>
              <Seal seal={election.seal} maxWidth="7rem" />
              <div>
                <H2>{election.title}</H2>
                <P>
                  {election.county.name}, {election.state}
                  <br />
                  {format.localeLongDate(
                    election.date.toMidnightDatetimeWithSystemTimezone()
                  )}
                </P>
              </div>
            </Row>
          </Card>
          <div>
            <UnconfigureMachineButton
              unconfigureMachine={() => unconfigureMutation.mutateAsync()}
              isMachineConfigured
            />
          </div>
        </Column>
      </MainContent>
    </ElectionManagerNavScreen>
  );
}

export function VotersScreen(): JSX.Element {
  const undoVoterCheckInMutation = undoVoterCheckIn.useMutation();
  return (
    <ElectionManagerNavScreen title="Voters">
      <MainContent>
        <VoterSearch
          renderAction={(voter) =>
            voter.checkIn ? (
              <Column style={{ gap: '0.5rem' }}>
                <CheckInDetails checkIn={voter.checkIn} />
                <Button
                  style={{ flexWrap: 'nowrap' }}
                  icon="Delete"
                  color="danger"
                  onPress={() => {
                    undoVoterCheckInMutation.mutate({ voterId: voter.voterId });
                  }}
                >
                  <Font noWrap>Undo Check-In</Font>
                </Button>
              </Column>
            ) : (
              <Row style={{ gap: '0.5rem' }}>
                <Font noWrap>
                  <Icons.X /> Not Checked In
                </Font>
              </Row>
            )
          }
        />
      </MainContent>
    </ElectionManagerNavScreen>
  );
}

const IntervalControl = styled(SegmentedButton)`
  button {
    font-size: 0.9rem;
    padding: 0.25rem 0.5rem;
  }
`;

export function ThroughputChart(): JSX.Element {
  const [intervalMin, setIntervalMin] = useState(60);
  const getThroughputQuery = getThroughputStatistics.useQuery({
    throughputInterval: intervalMin,
  });
  if (!getThroughputQuery.isSuccess) {
    return <Loading />;
  }
  const throughputData = getThroughputQuery.data;

  return (
    <TitledCard
      title={
        <Row
          style={{
            gap: '1rem',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <H4>Voter Throughput</H4>
          <IntervalControl
            label="Interval"
            hideLabel
            selectedOptionId={String(intervalMin)}
            options={[
              { id: '15', label: '15m' },
              { id: '30', label: '30m' },
              { id: '60', label: '1h' },
            ]}
            onChange={(selectedId) =>
              setIntervalMin(safeParseInt(selectedId).unsafeUnwrap())
            }
          />
        </Row>
      }
    >
      <div style={{ height: '17rem' }}>
        <Bar
          data={{
            labels: throughputData.map((stat) => new Date(stat.startTime)),
            datasets: [
              {
                label: 'Check-Ins',
                data: throughputData.map((stat) => stat.checkIns),
                backgroundColor: colorThemes.desktop.inversePrimary,
              },
            ],
          }}
          plugins={[ChartDataLabels]}
          options={{
            maintainAspectRatio: false,
            layout: {
              padding: { top: 20 },
            },
            plugins: {
              legend: {
                display: false,
              },
              datalabels: {
                display: true,
                font: { size: 16 },
                anchor: 'end',
                align: 'top',
              },
            },
            scales: {
              x: {
                type: 'time',
                ticks: {
                  source: 'data',
                },
                title: {
                  display: false,
                },
              },
              y: {
                title: {
                  display: true,
                  text: 'Check-Ins',
                },
              },
            },
          }}
        />
      </div>
    </TitledCard>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | React.ReactNode;
}): JSX.Element {
  return (
    <Column>
      <div style={{ fontSize: '0.85rem' }}>{label}</div>
      <Font weight="bold" style={{ fontSize: '1.5rem' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </Font>
    </Column>
  );
}

export function StatisticsScreen(): JSX.Element {
  const getSummaryStatisticsQuery = getSummaryStatistics.useQuery();
  if (!getSummaryStatisticsQuery.isSuccess) {
    return <Loading />;
  }
  const {
    totalVoters,
    totalCheckIns,
    totalNewRegistrations,
    totalAbsenteeCheckIns,
  } = getSummaryStatisticsQuery.data;
  const precinctCheckIns = totalCheckIns - totalAbsenteeCheckIns;
  const participationPercent = ((totalCheckIns / totalVoters) * 100).toFixed(1);

  return (
    <ElectionManagerNavScreen title="Statistics">
      <MainContent>
        <Column style={{ gap: '1rem', height: '100%' }}>
          <Row style={{ gap: '1rem' }}>
            <TitledCard title="Check-Ins">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr 1fr',
                  gap: '2rem',
                }}
              >
                <Metric
                  label="Total"
                  value={
                    <span>
                      {totalCheckIns.toLocaleString()} ({participationPercent}
                      %)
                    </span>
                  }
                />
                <Metric label="Precinct" value={precinctCheckIns} />
                <Metric label="Absentee" value={totalAbsenteeCheckIns} />
              </div>
            </TitledCard>
            <TitledCard title="Voters">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '2rem',
                }}
              >
                <Metric label="Total" value={totalVoters} />
                <Metric
                  label="Imported"
                  value={totalVoters - totalNewRegistrations}
                />
                <Metric label="Added" value={totalNewRegistrations} />
              </div>
            </TitledCard>
          </Row>
          <ThroughputChart />
        </Column>
      </MainContent>
    </ElectionManagerNavScreen>
  );
}

export function SettingsScreen(): JSX.Element | null {
  const getIsAbsenteeModeQuery = getIsAbsenteeMode.useQuery();
  const setIsAbsenteeModeMutation = setIsAbsenteeMode.useMutation();

  if (!getIsAbsenteeModeQuery.isSuccess) {
    return null;
  }
  const isAbsenteeMode = getIsAbsenteeModeQuery.data;

  return (
    <ElectionManagerNavScreen title="Settings">
      <MainContent>
        <SegmentedButton
          label="Check-In Mode"
          selectedOptionId={isAbsenteeMode ? 'absentee' : 'precinct'}
          options={[
            { label: 'Precinct Mode', id: 'precinct' },
            { label: 'Absentee Mode', id: 'absentee', icon: 'Envelope' },
          ]}
          onChange={(selectedId) =>
            setIsAbsenteeModeMutation.mutate({
              isAbsenteeMode: selectedId === 'absentee',
            })
          }
        />
      </MainContent>
    </ElectionManagerNavScreen>
  );
}

export function ElectionManagerScreen(): JSX.Element {
  return (
    <Switch>
      <Route
        path={electionManagerRoutes.election.path}
        component={ElectionScreen}
      />
      <Route
        path={electionManagerRoutes.voters.path}
        component={VotersScreen}
      />
      <Route
        path={electionManagerRoutes.statistics.path}
        component={StatisticsScreen}
      />
      <Route
        path={electionManagerRoutes.settings.path}
        component={SettingsScreen}
      />
      <Redirect to={electionManagerRoutes.election.path} />
    </Switch>
  );
}
