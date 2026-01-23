import {
  getImportedVotersCountRaw,
  getUndeclaredPrimaryPartyChoice,
  safeParseInt,
} from '@votingworks/types';
import {
  SegmentedButton,
  Loading,
  H4,
  colorThemes,
  Font,
  MainContent,
  H1,
  Button,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import type { PartyFilterAbbreviation } from '@votingworks/pollbook-backend';
import React, { useState } from 'react';
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
import {
  getThroughputStatistics,
  getGeneralSummaryStatistics,
  getElection,
  getPrimarySummaryStatistics,
  printGeneralStatisticsSummaryReceipt,
  printPrimaryStatisticsSummaryReceipt,
} from './api';
import { Row, Column } from './layout';
import { ElectionManagerNavScreen } from './nav_screen';
import { TitledCard } from './shared_components';

ChartJS.register(TimeScale, LinearScale, BarElement, Title, Tooltip, Legend);
ChartJS.defaults.font.size = 16;

const SmallSegmentedControl = styled(SegmentedButton)`
  button {
    font-size: 0.9rem;
    padding: 0.25rem 0.5rem;
  }
`;

const Container = styled('div')`
  flex: 1;

  > div {
    padding: 0;
  }

  h4 {
    margin: 0;
  }
`;

export function ThroughputChart({
  partyFilter,
}: {
  partyFilter: PartyFilterAbbreviation;
}): JSX.Element {
  const [intervalMin, setIntervalMin] = useState(60);
  const getThroughputQuery = getThroughputStatistics.useQuery({
    throughputInterval: intervalMin,
    partyFilter,
  });
  // Any check in from an undeclared voter is counted as a check-in for the ballot party chosen, viewing check in / throughput
  // information for undeclared voters is not supported.
  assert(partyFilter !== 'UND');
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
          <H4>Precinct Voter Throughput</H4>
          <SmallSegmentedControl
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
              padding: { top: 30 },
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
                ticks: {
                  stepSize: 1,
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

export function GeneralElectionStatistics(): JSX.Element {
  const [partyFilter, setPartyFilter] =
    useState<PartyFilterAbbreviation>('ALL');
  const getSummaryStatisticsQuery = getGeneralSummaryStatistics.useQuery({
    partyFilter,
  });
  const printGeneralStatisticsSummaryReceiptMutation =
    printGeneralStatisticsSummaryReceipt.useMutation();
  if (!getSummaryStatisticsQuery.isSuccess) {
    return (
      <ElectionManagerNavScreen title="Statistics">
        <MainContent>
          <Column style={{ gap: '1rem', height: '100%' }}>
            <Row style={{ gap: '1rem' }}>
              <Container style={{ height: '238px' }}>
                <Loading />
              </Container>
            </Row>
            <ThroughputChart partyFilter="ALL" />
          </Column>
        </MainContent>
      </ElectionManagerNavScreen>
    );
  }
  const stats = getSummaryStatisticsQuery.data;
  const {
    totalVoters,
    totalCheckIns,
    totalNewRegistrations,
    totalAbsenteeCheckIns,
  } = stats;
  const precinctCheckIns = totalCheckIns - totalAbsenteeCheckIns;

  return (
    <ElectionManagerNavScreen title="Statistics">
      <MainContent>
        <Column style={{ gap: '1rem', height: '100%' }}>
          <Row style={{ gap: '1rem' }}>
            <TitledCard
              title={
                // When its a general election the Voters card has a taller header due to including a segemented control, this style change makes the UX consistent.
                <H4
                  style={{
                    height: '2rem',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  Check-Ins
                </H4>
              }
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '2rem',
                }}
              >
                <Metric
                  label="Total"
                  value={<span>{totalCheckIns.toLocaleString()}</span>}
                />
                <Metric label="Precinct" value={precinctCheckIns} />
                <Metric label="Absentee" value={totalAbsenteeCheckIns} />
              </div>
            </TitledCard>
            <TitledCard
              title={
                <span
                  style={{ display: 'flex', justifyContent: 'space-between' }}
                >
                  <H4 style={{ display: 'flex', alignItems: 'center' }}>
                    Voters
                  </H4>
                  <SmallSegmentedControl
                    label="Party"
                    hideLabel
                    selectedOptionId={String(partyFilter)}
                    options={[
                      { id: 'ALL', label: 'All' },
                      { id: 'DEM', label: 'Dem' },
                      { id: 'REP', label: 'Rep' },
                      { id: 'UND', label: 'Und' },
                    ]}
                    onChange={(selectedId) =>
                      setPartyFilter(selectedId as PartyFilterAbbreviation)
                    }
                  />
                </span>
              }
            >
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
                  value={getImportedVotersCountRaw(stats)}
                />
                <Metric label="Added" value={totalNewRegistrations} />
              </div>
            </TitledCard>
          </Row>
          <ThroughputChart partyFilter="ALL" />
          <Button
            onPress={() =>
              printGeneralStatisticsSummaryReceiptMutation.mutate()
            }
          >
            Print
          </Button>
        </Column>
      </MainContent>
    </ElectionManagerNavScreen>
  );
}

export function PrimaryElectionStatistics(): JSX.Element {
  const [partyFilter, setPartyFilter] =
    useState<PartyFilterAbbreviation>('ALL');
  const getSummaryStatisticsQuery = getPrimarySummaryStatistics.useQuery({
    partyFilter,
  });
  const printPrimaryStatisticsSummaryReceiptMutation =
    printPrimaryStatisticsSummaryReceipt.useMutation();
  const title = (
    <span
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        width: '100%',
      }}
    >
      <H1>Statistics</H1>
      <SmallSegmentedControl
        label="Party"
        hideLabel
        selectedOptionId={String(partyFilter)}
        options={[
          { id: 'ALL', label: 'All' },
          { id: 'DEM', label: 'Dem' },
          { id: 'REP', label: 'Rep' },
          { id: 'UND', label: 'Und' },
        ]}
        onChange={(selectedId) =>
          setPartyFilter(selectedId as PartyFilterAbbreviation)
        }
      />
    </span>
  );
  if (!getSummaryStatisticsQuery.isSuccess) {
    return (
      <ElectionManagerNavScreen title={title}>
        <MainContent>
          <Column style={{ gap: '1rem', height: '100%' }}>
            <Row style={{ gap: '1rem' }}>
              <Container>
                <Loading />
              </Container>
            </Row>
          </Column>
          {partyFilter !== 'UND' && (
            <ThroughputChart partyFilter={partyFilter} />
          )}
        </MainContent>
      </ElectionManagerNavScreen>
    );
  }
  const {
    totalVoters,
    totalCheckIns,
    totalNewRegistrations,
    totalAbsenteeCheckIns,
  } = getSummaryStatisticsQuery.data;
  const precinctCheckIns = totalCheckIns - totalAbsenteeCheckIns;

  const votersCard = (
    <TitledCard title="Voters">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '2rem',
        }}
      >
        <Metric label="Total" value={totalVoters} />
        <Metric label="Imported" value={totalVoters - totalNewRegistrations} />
        <Metric label="Added" value={totalNewRegistrations} />
      </div>
    </TitledCard>
  );

  if (partyFilter === 'UND') {
    return (
      <ElectionManagerNavScreen title={title}>
        <MainContent>
          <Column style={{ gap: '1rem', height: '100%' }}>
            <Row style={{ gap: '1rem' }}>
              <TitledCard title="Declared Party">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '2rem',
                  }}
                >
                  <Metric
                    label="Democratic"
                    value={
                      <span>
                        {getUndeclaredPrimaryPartyChoice(
                          'DEM',
                          getSummaryStatisticsQuery.data
                        )}
                      </span>
                    }
                  />
                  <Metric
                    label="Republican"
                    value={
                      <span>
                        {getUndeclaredPrimaryPartyChoice(
                          'REP',
                          getSummaryStatisticsQuery.data
                        )}
                      </span>
                    }
                  />
                </div>
              </TitledCard>
              {votersCard}
            </Row>
          </Column>
        </MainContent>
      </ElectionManagerNavScreen>
    );
  }

  return (
    <ElectionManagerNavScreen title={title}>
      <MainContent>
        <Column style={{ gap: '1rem', height: '100%' }}>
          <Row style={{ gap: '1rem' }}>
            <TitledCard title="Check-Ins">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '2rem',
                }}
              >
                <Metric
                  label="Total"
                  value={<span>{totalCheckIns.toLocaleString()}</span>}
                />
                <Metric label="Precinct" value={precinctCheckIns} />
                <Metric label="Absentee" value={totalAbsenteeCheckIns} />
              </div>
            </TitledCard>
            {votersCard}
          </Row>
          <ThroughputChart partyFilter={partyFilter} />
          <Button
            onPress={() =>
              printPrimaryStatisticsSummaryReceiptMutation.mutate()
            }
          >
            Print
          </Button>
        </Column>
      </MainContent>
    </ElectionManagerNavScreen>
  );
}

export function StatisticsScreen(): JSX.Element {
  const getElectionQuery = getElection.useQuery();
  if (!getElectionQuery.isSuccess) {
    return (
      <ElectionManagerNavScreen title="Statistics">
        <MainContent>
          <Loading />
        </MainContent>
      </ElectionManagerNavScreen>
    );
  }

  const election = getElectionQuery.data.ok();
  assert(election !== undefined);
  if (election.type === 'primary') {
    return <PrimaryElectionStatistics />;
  }
  return <GeneralElectionStatistics />;
}
