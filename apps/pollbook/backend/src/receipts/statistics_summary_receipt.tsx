import { format } from '@votingworks/utils';
import {
  Election,
  PartyAbbreviation,
  getUndeclaredPrimaryPartyChoice,
  getUndeclaredPrimaryPartyChoiceRaw,
  PrimarySummaryStatistics,
  SummaryStatistics,
  getImportedVotersCount,
  getTotalPrecinctCheckIns,
} from '@votingworks/types';
import React from 'react';
import styled from 'styled-components';
import { VX_DEFAULT_MONOSPACE_FONT_FAMILY_DECLARATION } from '@votingworks/ui';
import { StyledReceipt, ReceiptMetadata, ReceiptIcon } from './receipt_helpers';

const TextRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 10pt;

  span:nth-of-type(2) {
    font-family: ${VX_DEFAULT_MONOSPACE_FONT_FAMILY_DECLARATION};
  }
`;

function HorizontalRule(): React.ReactNode {
  return (
    <div
      style={{
        borderTop: '1px solid black',
        margin: '2px 0',
      }}
    />
  );
}

export interface EventCounts {
  addressChange: number;
  nameChange: number;
}

function ImportedVoters({
  allStats,
  demStats,
  repStats,
  undeclaredStats,
}: {
  allStats: SummaryStatistics;
  demStats: SummaryStatistics;
  repStats: SummaryStatistics;
  undeclaredStats: SummaryStatistics;
}): React.ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TextRow>
        <strong>Imported Voters</strong>
      </TextRow>
      <TextRow>
        <span>Democratic</span>
        <span>{getImportedVotersCount(demStats)}</span>
      </TextRow>
      <TextRow>
        <span>Republican</span>
        <span>{getImportedVotersCount(repStats)}</span>
      </TextRow>
      <TextRow>
        <span>Undeclared</span>
        <span>{getImportedVotersCount(undeclaredStats)}</span>
      </TextRow>
      <HorizontalRule />
      <TextRow>
        <span>Total</span>
        <span>{getImportedVotersCount(allStats)}</span>
      </TextRow>
    </div>
  );
}

function AddedVoters({
  allStats,
  demStats,
  repStats,
  undeclaredStats,
}: {
  allStats: SummaryStatistics;
  demStats: SummaryStatistics;
  repStats: SummaryStatistics;
  undeclaredStats: SummaryStatistics;
}): React.ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TextRow>
        <strong>Added Voters</strong>
      </TextRow>
      <TextRow>
        <span>Democratic</span>
        <span>{demStats.totalNewRegistrations.toLocaleString()}</span>
      </TextRow>
      <TextRow>
        <span>Republican</span>
        <span>{repStats.totalNewRegistrations.toLocaleString()}</span>
      </TextRow>
      <TextRow>
        <span>Undeclared</span>
        <span>{undeclaredStats.totalNewRegistrations.toLocaleString()}</span>
      </TextRow>
      <HorizontalRule />
      <TextRow>
        <span>Total</span>
        <span>{allStats.totalNewRegistrations.toLocaleString()}</span>
      </TextRow>
    </div>
  );
}

function TotalVoters({
  allStats,
  demStats,
  repStats,
  undeclaredStats,
}: {
  allStats: SummaryStatistics;
  demStats: SummaryStatistics;
  repStats: SummaryStatistics;
  undeclaredStats: SummaryStatistics;
}): React.ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TextRow>
        <strong>Total Voters</strong>
      </TextRow>
      <TextRow>
        <span>Democratic</span>
        <span>{demStats.totalVoters.toLocaleString()}</span>
      </TextRow>
      <TextRow>
        <span>Republican</span>
        <span>{repStats.totalVoters.toLocaleString()}</span>
      </TextRow>
      <TextRow>
        <span>Undeclared</span>
        <span>{undeclaredStats.totalVoters.toLocaleString()}</span>
      </TextRow>
      <HorizontalRule />
      <TextRow>
        <span>Total</span>
        <span>{allStats.totalVoters.toLocaleString()}</span>
      </TextRow>
    </div>
  );
}

function GeneralCheckIns({
  stats,
}: {
  stats: SummaryStatistics;
}): React.ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TextRow>
        <strong>Check-Ins</strong>
      </TextRow>
      <TextRow>
        <span>Precinct</span>
        <span>{getTotalPrecinctCheckIns(stats)}</span>
      </TextRow>
      <TextRow>
        <span>Absentee</span>
        <span>{stats.totalAbsenteeCheckIns.toLocaleString()}</span>
      </TextRow>
      <HorizontalRule />
      <TextRow>
        <span>Total</span>
        <span>{stats.totalCheckIns.toLocaleString()}</span>
      </TextRow>
    </div>
  );
}

function PartyCheckIns({
  partyAbbreviation,
  partyStats,
}: {
  partyAbbreviation: Omit<PartyAbbreviation, 'UND'>;
  partyStats: SummaryStatistics;
}): React.ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TextRow>
        <strong>
          {partyAbbreviation === 'DEM' ? 'Democratic' : 'Republican'} Party
          Check-Ins
        </strong>
      </TextRow>
      <TextRow>
        <span>Precinct</span>
        <span>{getTotalPrecinctCheckIns(partyStats)}</span>
      </TextRow>
      <TextRow>
        <span>Absentee</span>
        <span>{partyStats.totalAbsenteeCheckIns.toLocaleString()}</span>
      </TextRow>
      <HorizontalRule />
      <TextRow>
        <span>Total</span>
        <span>{partyStats.totalCheckIns.toLocaleString()}</span>
      </TextRow>
    </div>
  );
}

function UndeclaredVoterPartyChoice({
  undeclaredVoterStats,
}: {
  undeclaredVoterStats: PrimarySummaryStatistics;
}): React.ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TextRow>
        <strong>Undeclared Voter Party Choice</strong>
      </TextRow>
      <TextRow>
        <span>Democratic</span>
        <span>
          {getUndeclaredPrimaryPartyChoice('DEM', undeclaredVoterStats)}
        </span>
      </TextRow>
      <TextRow>
        <span>Republican</span>
        <span>
          {getUndeclaredPrimaryPartyChoice('REP', undeclaredVoterStats)}
        </span>
      </TextRow>
      <HorizontalRule />
      <TextRow>
        <span>Total</span>
        <span>
          {(
            getUndeclaredPrimaryPartyChoiceRaw('DEM', undeclaredVoterStats) +
            getUndeclaredPrimaryPartyChoiceRaw('REP', undeclaredVoterStats)
          ).toLocaleString()}
        </span>
      </TextRow>
    </div>
  );
}

function BiographicalDataChangeCounts({
  eventCounts,
}: {
  eventCounts: EventCounts;
}): React.ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TextRow>
        <strong>Other Counts</strong>
      </TextRow>
      <TextRow>
        <span>Address Changes</span>
        <span>{eventCounts.addressChange.toLocaleString()}</span>
      </TextRow>
      <TextRow>
        <span>Name Changes</span>
        <span>{eventCounts.nameChange.toLocaleString()}</span>
      </TextRow>
    </div>
  );
}

export function StatisticsSummaryReceipt({
  machineId,
  election,
  stats,
  eventCounts,
}: {
  machineId: string;
  election: Election;
  stats: {
    allStats: SummaryStatistics;
    demStats: SummaryStatistics;
    repStats: SummaryStatistics;
    undeclaredStats: SummaryStatistics;
  };
  eventCounts: EventCounts;
}): JSX.Element {
  const now = new Date();
  return (
    <StyledReceipt
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div>
          <div>
            <strong>Statistics Summary</strong>
          </div>
          <div>{format.localeNumericDateAndTime(now)}</div>
        </div>
        <ReceiptIcon icon="ChartLine" />
      </div>

      <ImportedVoters
        allStats={stats.allStats}
        demStats={stats.demStats}
        repStats={stats.repStats}
        undeclaredStats={stats.undeclaredStats}
      />

      <AddedVoters
        allStats={stats.allStats}
        demStats={stats.demStats}
        repStats={stats.repStats}
        undeclaredStats={stats.undeclaredStats}
      />

      <TotalVoters
        allStats={stats.allStats}
        demStats={stats.demStats}
        repStats={stats.repStats}
        undeclaredStats={stats.undeclaredStats}
      />

      {election.type === 'general' && (
        <GeneralCheckIns stats={stats.allStats} />
      )}

      {election.type === 'primary' && (
        <React.Fragment>
          <PartyCheckIns
            partyAbbreviation={'DEM'}
            partyStats={stats.demStats}
          />
          <PartyCheckIns
            partyAbbreviation={'REP'}
            partyStats={stats.repStats}
          />
          <UndeclaredVoterPartyChoice
            undeclaredVoterStats={
              stats.undeclaredStats as PrimarySummaryStatistics
            }
          />
        </React.Fragment>
      )}

      <BiographicalDataChangeCounts eventCounts={eventCounts} />

      <ReceiptMetadata machineId={machineId} election={election} />
    </StyledReceipt>
  );
}
