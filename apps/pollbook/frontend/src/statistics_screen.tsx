import { safeParseInt } from '@votingworks/types';
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
  getElection,
  printGeneralStatisticsSummaryReceipt,
  printPrimaryStatisticsSummaryReceipt,
  getDeviceStatuses,
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


// Mock throughput data matching screenshots (30-min intervals, 7:00 AM - 6:30 PM)
const MOCK_30M_CHECKINS: Record<string, number[]> = {
  ALL: [13, 22, 29, 26, 15, 9, 7, 7, 9, 9, 13, 15, 11, 8, 7, 9, 11, 13, 15, 19, 27, 38, 38, 30],
  REP: [10, 18, 23, 20, 12, 7, 5, 5, 7, 7, 11, 11, 9, 6, 5, 7, 9, 13, 17, 23, 32, 47, 48, 37],
  DEM: [16, 26, 31, 28, 17, 11, 7, 7, 9, 9, 16, 18, 11, 8, 6, 7, 9, 11, 13, 15, 20, 27, 27, 22],
};

function getMockThroughputData(intervalMin: number, partyFilter: string) {
  const baseData = MOCK_30M_CHECKINS[partyFilter] ?? MOCK_30M_CHECKINS.ALL;
  const today = new Date();
  function makeTime(hour: number, min: number) {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, min).toISOString();
  }

  if (intervalMin === 15) {
    return baseData.flatMap((val, i) => {
      const hour = 7 + Math.floor((i * 30) / 60);
      const min = (i * 30) % 60;
      return [
        { checkIns: Math.ceil(val / 2), startTime: makeTime(hour, min), interval: 15 },
        { checkIns: Math.floor(val / 2), startTime: makeTime(hour + (min + 15 >= 60 ? 1 : 0), (min + 15) % 60), interval: 15 },
      ];
    });
  }
  if (intervalMin === 60) {
    const result = [];
    for (let i = 0; i < baseData.length; i += 2) {
      const hour = 7 + Math.floor((i * 30) / 60);
      result.push({
        checkIns: baseData[i] + (baseData[i + 1] ?? 0),
        startTime: makeTime(hour, 0),
        interval: 60,
      });
    }
    return result;
  }
  // 30 min
  return baseData.map((val, i) => {
    const hour = 7 + Math.floor((i * 30) / 60);
    const min = (i * 30) % 60;
    return { checkIns: val, startTime: makeTime(hour, min), interval: 30 };
  });
}

export function ThroughputChart({
  partyFilter,
}: {
  partyFilter: PartyFilterAbbreviation;
}): JSX.Element {
  const [intervalMin, setIntervalMin] = useState(30);
  // Any check in from an undeclared voter is counted as a check-in for the ballot party chosen, viewing check in / throughput
  // information for undeclared voters is not supported.
  assert(partyFilter !== 'UND');

  // Mock data for documentation screenshots
  const throughputData = getMockThroughputData(intervalMin, partyFilter);

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
  const printGeneralStatisticsSummaryReceiptMutation =
    printGeneralStatisticsSummaryReceipt.useMutation();
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const isPrinterAttached = getDeviceStatusesQuery.data?.printer.connected;

  // Mock data for documentation screenshots
  const totalCheckIns = 400;
  const totalAbsenteeCheckIns = 53;
  const precinctCheckIns = totalCheckIns - totalAbsenteeCheckIns; // 347
  const mockVotersByParty: Record<PartyFilterAbbreviation, { total: number; imported: number; added: number }> = {
    ALL: { total: 2847, imported: 2819, added: 28 },
    REP: { total: 1142, imported: 1131, added: 11 },
    DEM: { total: 1254, imported: 1242, added: 12 },
    UND: { total: 451, imported: 446, added: 5 },
  };
  const { total: totalVoters, imported: importedVoters, added: addedVoters } = mockVotersByParty[partyFilter];

  return (
    <ElectionManagerNavScreen
      title={
        <span
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <H1>Statistics</H1>
          <Button
            onPress={printGeneralStatisticsSummaryReceiptMutation.mutate}
            disabled={
              !isPrinterAttached ||
              printGeneralStatisticsSummaryReceiptMutation.isLoading
            }
            icon="Print"
            style={{
              fontSize: '0.8rem',
              padding: '0.25rem 0.75rem',
            }}
          >
            Print All
          </Button>
        </span>
      }
    >
      <MainContent>
        <Column style={{ gap: '1rem', height: '100%' }}>
          <Row style={{ gap: '1rem' }}>
            <TitledCard
              title={
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
                <Metric
                  label="Precinct"
                  value={precinctCheckIns}
                />
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
                  value={importedVoters}
                />
                <Metric label="Added" value={addedVoters} />
              </div>
            </TitledCard>
          </Row>
          <ThroughputChart partyFilter="ALL" />
        </Column>
      </MainContent>
    </ElectionManagerNavScreen>
  );
}

export function PrimaryElectionStatistics(): JSX.Element {
  const [partyFilter, setPartyFilter] =
    useState<PartyFilterAbbreviation>('ALL');
  const printPrimaryStatisticsSummaryReceiptMutation =
    printPrimaryStatisticsSummaryReceipt.useMutation();
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const isPrinterAttached = getDeviceStatusesQuery.data?.printer.connected;

  // Mock data for documentation screenshots
  const mockCheckInsByParty: Record<string, { total: number; precinct: number; absentee: number }> = {
    ALL: { total: 400, precinct: 347, absentee: 53 },
    REP: { total: 185, precinct: 161, absentee: 24 },
    DEM: { total: 165, precinct: 143, absentee: 22 },
  };
  const mockVotersByParty: Record<PartyFilterAbbreviation, { total: number; imported: number; added: number }> = {
    ALL: { total: 2847, imported: 2819, added: 28 },
    REP: { total: 1142, imported: 1131, added: 11 },
    DEM: { total: 1254, imported: 1242, added: 12 },
    UND: { total: 451, imported: 446, added: 5 },
  };
  const checkIns = mockCheckInsByParty[partyFilter] ?? mockCheckInsByParty.ALL;
  const voters = mockVotersByParty[partyFilter];

  const title = (
    <span
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        width: '100%',
      }}
    >
      <H1>Statistics</H1>
      <div style={{ display: 'flex', gap: '1rem' }}>
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
        <Button
          onPress={printPrimaryStatisticsSummaryReceiptMutation.mutate}
          disabled={
            !isPrinterAttached ||
            printPrimaryStatisticsSummaryReceiptMutation.isLoading
          }
          icon="Print"
          style={{
            fontSize: '0.8rem',
            padding: '0.25rem 0.75rem',
          }}
        >
          Print All
        </Button>
      </div>
    </span>
  );

  const votersCard = (
    <TitledCard title="Voters">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '2rem',
        }}
      >
        <Metric label="Total" value={voters.total} />
        <Metric label="Imported" value={voters.imported} />
        <Metric label="Added" value={voters.added} />
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
                  <Metric label="Democratic" value={42} />
                  <Metric label="Republican" value={58} />
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
                  value={<span>{checkIns.total.toLocaleString()}</span>}
                />
                <Metric label="Precinct" value={checkIns.precinct} />
                <Metric label="Absentee" value={checkIns.absentee} />
              </div>
            </TitledCard>
            {votersCard}
          </Row>
          <ThroughputChart partyFilter={partyFilter} />
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
