import {
  assert,
  throwIllegalValue,
  typedAs,
  unique,
} from '@votingworks/basics';
import {
  Admin,
  Election,
  isCombinedBallotPrimary,
  Tabulation,
} from '@votingworks/types';
import { useState } from 'react';
import styled from 'styled-components';
import {
  SearchSelect,
  SelectOption,
  Button,
  getBallotStyleLabel,
} from '@votingworks/ui';
import type { ScannerBatch } from '@votingworks/admin-backend';
import { getGroupedBallotStyles } from '@votingworks/utils';
import { getScannerBatches, getSystemSettings } from '../../api';
import {
  getPartiesWithPrimaryElections,
  getValidDistricts,
} from '../../utils/election';

const FilterEditorContainer = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const FilterRow = styled.div`
  flex-shrink: 0;
  width: 100%;
  display: grid;
  grid-template-columns:
    10rem
    2rem
    minmax(0, 1fr) /* Prevent select from overflowing when options are long */
    2.25rem;
  align-items: center;
`;

const Predicate = styled.div`
  justify-self: center;
`;

const AddButton = styled(Button)`
  min-width: 6rem;
`;

const RemoveButton = styled(Button)`
  margin-left: 0.25rem;
  width: 1rem;
`;

export type FilterType =
  | 'precinct'
  | 'voting-method'
  | 'ballot-style'
  | 'scanner'
  | 'batch'
  | 'party'
  | 'adjudication-status'
  | 'district';

interface FilterRow {
  rowId: number;
  filterType: FilterType;
  filterValues: string[];
}
type FilterRows = FilterRow[];

const FILTER_TYPE_LABELS: Record<FilterType, string> = {
  precinct: 'Precinct',
  'voting-method': 'Voting Method',
  'ballot-style': 'Ballot Style',
  scanner: 'Scanner',
  batch: 'Batch',
  party: 'Party',
  'adjudication-status': 'Adjudication Status',
  district: 'District',
};

const NO_PARTY_FILTER_VALUE = '__NO_PARTY_FILTER__';

function getFilterTypeOption(filterType: FilterType): SelectOption<FilterType> {
  return {
    value: filterType,
    label: FILTER_TYPE_LABELS[filterType],
  };
}

function generateOptionsForFilter({
  filterType,
  election,
  scannerBatches,
  isEarlyVotingEnabled,
}: {
  filterType: FilterType;
  election: Election;
  scannerBatches: ScannerBatch[];
  isEarlyVotingEnabled: boolean;
}): SelectOption[] {
  switch (filterType) {
    case 'precinct':
      return election.precincts.map((precinct) => ({
        value: precinct.id,
        label: precinct.name,
      }));
    case 'ballot-style': {
      return getGroupedBallotStyles(election.ballotStyles).map(
        (ballotStyleGroup) => ({
          value: ballotStyleGroup.id,
          label: getBallotStyleLabel(election, ballotStyleGroup.id),
        })
      );
    }
    case 'party': {
      const partyOptions = getPartiesWithPrimaryElections(election).map(
        (party) => ({
          value: party.id,
          label: party.name,
        })
      );
      if (isCombinedBallotPrimary(election)) {
        partyOptions.push({
          value: NO_PARTY_FILTER_VALUE,
          label: 'No Party',
        });
      }
      return partyOptions;
    }
    case 'voting-method':
      return typedAs<Array<SelectOption<Tabulation.VotingMethod>>>([
        // @coverage-defer
        ...(isEarlyVotingEnabled
          ? [
              {
                value: 'early_voting' as const,
                label: 'Early Voting',
              },
            ]
          : []),
        {
          value: 'precinct',
          label: 'Precinct',
        },
        {
          value: 'absentee',
          label: 'Absentee',
        },
      ]);
    case 'scanner':
      return unique(scannerBatches.map((sb) => sb.scannerId)).map(
        (scannerId) => ({
          value: scannerId,
          label: scannerId,
        })
      );
    case 'batch':
      return scannerBatches.map((sb) => ({
        value: sb.batchId,
        label: `Scanner ${sb.scannerId}, ${sb.label}`,
      }));
    case 'adjudication-status':
      return Object.entries(Admin.ADJUDICATION_FLAG_LABELS)
        .filter(
          ([flag]) =>
            isCombinedBallotPrimary(election) || flag !== 'hasCrossoverVote'
        )
        .map(([value, label]) => ({
          value,
          label,
        }));
    case 'district':
      return getValidDistricts(election).map((district) => ({
        value: district.id,
        label: district.name,
      }));
    default: {
      throwIllegalValue(filterType);
    }
  }
}

// allow modifying filter during construction for convenience
type Writeable<T> = { -readonly [P in keyof T]: T[P] };

function convertFilterRowsToTabulationFilter(
  rows: FilterRows
): Admin.FrontendReportingFilter {
  const filter: Writeable<Admin.FrontendReportingFilter> = {};
  for (const row of rows) {
    const { filterType, filterValues } = row;
    switch (filterType) {
      case 'precinct':
        filter.precinctIds = filterValues;
        break;
      case 'voting-method':
        filter.votingMethods = filterValues as Tabulation.VotingMethod[];
        break;
      case 'ballot-style':
        filter.ballotStyleGroupIds = filterValues;
        break;
      case 'party':
        filter.partyIds = filterValues.map((value) =>
          value === NO_PARTY_FILTER_VALUE ? Tabulation.NO_PARTY_ID : value
        );
        break;
      case 'scanner':
        filter.scannerIds = filterValues;
        break;
      case 'batch':
        filter.batchIds = filterValues;
        break;
      case 'adjudication-status':
        filter.adjudicationFlags =
          filterValues as Admin.CastVoteRecordAdjudicationFlag[];
        break;
      case 'district':
        filter.districtIds = filterValues;
        break;
      default: {
        throwIllegalValue(filterType);
      }
    }
  }

  return filter;
}

export interface FilterEditorProps {
  onChange: (filter: Admin.FrontendReportingFilter) => void;
  election: Election;
  allowedFilters: FilterType[];
}

export function FilterEditor({
  onChange,
  election,
  allowedFilters,
}: FilterEditorProps): JSX.Element {
  const [rows, setRows] = useState<FilterRows>([]);
  const [nextRowId, setNextRowId] = useState(0);
  const [isAddingRow, setIsAddingRow] = useState(false);

  const scannerBatchesQuery = getScannerBatches.useQuery();
  const scannerBatches = scannerBatchesQuery.data ?? [];
  const getSystemSettingsQuery = getSystemSettings.useQuery();
  const isEarlyVotingEnabled = Boolean(
    getSystemSettingsQuery.data?.enableEarlyVoting
  );

  function onUpdatedRows(updatedRows: FilterRows) {
    setRows(updatedRows);
    onChange(convertFilterRowsToTabulationFilter(updatedRows));
  }

  function addRow(filterType: FilterType) {
    onUpdatedRows([
      ...rows,
      {
        rowId: nextRowId,
        filterType,
        filterValues: [],
      },
    ]);
    setNextRowId((i) => i + 1);
  }

  function updateRowFilterType(rowId: number, newFilterType: FilterType): void {
    onUpdatedRows(
      rows.map((row) =>
        row.rowId === rowId
          ? { ...row, filterType: newFilterType, filterValues: [] }
          : row
      )
    );
  }

  function updateRowFilterValues(rowId: number, filterValues: string[]) {
    onUpdatedRows(
      rows.map((row) => (row.rowId === rowId ? { ...row, filterValues } : row))
    );
  }

  function deleteRow(rowId: number) {
    onUpdatedRows(rows.filter((row) => row.rowId !== rowId));
  }

  const activeFilters: FilterType[] = rows.map((row) => row.filterType);
  const unusedFilters: FilterType[] = allowedFilters.filter(
    (filterType) => !activeFilters.includes(filterType)
  );

  return (
    <FilterEditorContainer data-testid="filter-editor">
      {rows.map((row) => {
        const { filterType, rowId } = row;
        return (
          <FilterRow
            key={rowId}
            data-testid={`filter-editor-row-${filterType}`}
          >
            <SearchSelect
              isMulti={false}
              isSearchable={false}
              value={filterType}
              options={[
                getFilterTypeOption(filterType),
                ...unusedFilters.map(getFilterTypeOption),
              ]}
              onChange={(newFilterType) => {
                assert(newFilterType !== undefined);
                updateRowFilterType(rowId, newFilterType);
              }}
              aria-label="Edit Filter Type"
            />
            <Predicate>is</Predicate>
            <SearchSelect<string>
              isMulti
              isSearchable
              key={filterType}
              options={generateOptionsForFilter({
                filterType,
                election,
                scannerBatches,
                isEarlyVotingEnabled,
              })}
              value={row.filterValues}
              onChange={(filterValues) => {
                updateRowFilterValues(rowId, filterValues);
              }}
              aria-label="Select Filter Values"
            />
            <div>
              <RemoveButton
                icon="X"
                fill="transparent"
                onPress={() => deleteRow(rowId)}
                aria-label="Remove Filter"
              />
            </div>
          </FilterRow>
        );
      })}
      {unusedFilters.length > 0 && (
        <FilterRow key="new-row">
          {isAddingRow ? (
            <SearchSelect
              key={nextRowId}
              isMulti={false}
              isSearchable={false}
              options={unusedFilters
                .filter(
                  (filterType) => !rows.some((r) => r.filterType === filterType)
                )
                .map((filterType) => getFilterTypeOption(filterType))}
              onChange={(filterType) => {
                assert(filterType !== undefined);
                addRow(filterType);
                setIsAddingRow(false);
              }}
              aria-label="Select New Filter Type"
            />
          ) : (
            <AddButton icon="Add" onPress={() => setIsAddingRow(true)}>
              Add Filter
            </AddButton>
          )}
          {isAddingRow && (
            <RemoveButton
              style={{ width: '1rem' }}
              icon="X"
              fill="transparent"
              onPress={() => setIsAddingRow(false)}
              aria-label="Cancel Add Filter"
            />
          )}
        </FilterRow>
      )}
    </FilterEditorContainer>
  );
}
