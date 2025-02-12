import {
  Button,
  Card,
  colorThemes,
  Font,
  H2,
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
import { useState } from 'react';
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
import { Column, FieldName, Row } from './layout';
import { VoterSearch } from './voter_search_screen';

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

export function ThroughputChart(): JSX.Element {
  const [intervalMin, setIntervalMin] = useState(60);
  const getThroughputQuery = getThroughputStatistics.useQuery({
    throughputInterval: intervalMin,
  });
  if (!getThroughputQuery.isSuccess) {
    return <Loading />;
  }
  const throughputData = getThroughputQuery.data;
  if (throughputData.length === 0) {
    return <P>Throughput will be visible after check-ins have begun.</P>;
  }

  // Change the interval based on SegmentedButton selection
  function handleIntervalChange(selectedId: string) {
    setIntervalMin(safeParseInt(selectedId).unsafeUnwrap());
  }

  return (
    <Column style={{ gap: '1rem', flex: 1 }}>
      <Row style={{ gap: '1rem', justifyContent: 'space-between', flex: 1 }}>
        <H2>Voter Throughput</H2>
        <Column>
          <SegmentedButton
            label="Interval"
            hideLabel
            selectedOptionId={String(intervalMin)}
            options={[
              { id: '15', label: '15m' },
              { id: '30', label: '30m' },
              { id: '60', label: '1h' },
            ]}
            onChange={handleIntervalChange}
          />
        </Column>
      </Row>
      <Column style={{ height: '320px', width: '1400px' }}>
        <Row style={{ flex: 1 }}>
          <Font style={{ fontSize: '0.75rem' }}>
            Number of check-ins occurring in the time interval across all
            machines.
          </Font>
        </Row>
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
      </Column>
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
  // Fake data for statistics
  const precinctCheckIns = totalCheckIns - totalAbsenteeCheckIns;
  const participationPercent = ((totalCheckIns / totalVoters) * 100).toFixed(1);

  return (
    <ElectionManagerNavScreen title="Statistics">
      <MainContent>
        <Column style={{ gap: '1rem' }}>
          <Row style={{ gap: '1rem' }}>
            <Column style={{ gap: '1rem', flex: 1 }}>
              <Card>
                <H2>Check-In Data</H2>
                <P>
                  Precinct Check-Ins:<b> {precinctCheckIns}</b>
                </P>
                <P>
                  Absentee Check-Ins: <b> {totalAbsenteeCheckIns}</b>
                </P>
                <P>
                  Total: <b>{totalCheckIns}</b>
                </P>
              </Card>
            </Column>
            <Column style={{ gap: '1rem', flex: 1 }}>
              <Card>
                <H2>Registration Data</H2>
                <P>
                  Imported Voter Roll:{' '}
                  <b>{totalVoters - totalNewRegistrations} Voters</b>
                </P>
                <P>
                  New Registrations: <b>{totalNewRegistrations}</b>
                </P>
                <P>
                  Participation:{' '}
                  <b>
                    {participationPercent}% ({totalCheckIns}/{totalVoters})
                  </b>
                </P>
              </Card>
            </Column>
          </Row>
          <Row>
            <Card>
              <ThroughputChart />
            </Card>
          </Row>
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
