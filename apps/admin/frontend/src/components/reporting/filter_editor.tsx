import {
  assert,
  throwIllegalValue,
  typedAs,
  unique,
} from '@votingworks/basics';
import { Admin, Election, Tabulation } from '@votingworks/types';
import { useState } from 'react';
import styled from 'styled-components';
import { SearchSelect, SelectOption, Button } from '@votingworks/ui';
import type { ScannerBatch } from '@votingworks/admin-backend';
import { getScannerBatches } from '../../api';
import { getPartiesWithPrimaryElections } from '../../utils/election';

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
  grid-template-columns: 10rem 4rem 1fr 2.25rem;
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

const FILTER_TYPES = [
  'precinct',
  'voting-method',
  'ballot-style',
  'scanner',
  'batch',
  'party',
  'adjudication-status',
] as const;
export type FilterType = (typeof FILTER_TYPES)[number];

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
};

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
}: {
  filterType: FilterType;
  election: Election;
  scannerBatches: ScannerBatch[];
}): SelectOption[] {
  switch (filterType) {
    case 'precinct':
      return election.precincts.map((precinct) => ({
        value: precinct.id,
        label: precinct.name,
      }));
    case 'ballot-style':
      return election.ballotStyles.map((bs) => ({
        value: bs.id,
        label: bs.id,
      }));
    case 'party':
      return getPartiesWithPrimaryElections(election).map((party) => ({
        value: party.id,
        label: party.name,
      }));
    case 'voting-method':
      return typedAs<Array<SelectOption<Tabulation.VotingMethod>>>([
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
        label: `${sb.scannerId} • ${sb.batchId.slice(0, 8)}`,
      }));
    case 'adjudication-status':
      return Object.entries(Admin.ADJUDICATION_FLAG_LABELS).map(
        ([value, label]) => ({
          value,
          label,
        })
      );
    /* istanbul ignore next - compile-time check for completeness */
    default:
      throwIllegalValue(filterType);
  }
}

// allow modifying filter during construction for convenience
type Writeable<T> = { -readonly [P in keyof T]: T[P] };

function convertFilterRowsToTabulationFilter(
  rows: FilterRows
): Admin.ReportingFilter {
  const tabulationFilter: Writeable<Admin.ReportingFilter> = {};
  for (const row of rows) {
    const { filterType, filterValues } = row;
    switch (filterType) {
      case 'precinct':
        tabulationFilter.precinctIds = filterValues;
        break;
      case 'voting-method':
        tabulationFilter.votingMethods =
          filterValues as Tabulation.VotingMethod[];
        break;
      case 'ballot-style':
        tabulationFilter.ballotStyleIds = filterValues;
        break;
      case 'party':
        tabulationFilter.partyIds = filterValues;
        break;
      case 'scanner':
        tabulationFilter.scannerIds = filterValues;
        break;
      case 'batch':
        tabulationFilter.batchIds = filterValues;
        break;
      case 'adjudication-status':
        tabulationFilter.adjudicationFlags =
          filterValues as Admin.CastVoteRecordAdjudicationFlag[];
        break;
      /* istanbul ignore next - compile-time check for completeness */
      default:
        throwIllegalValue(filterType);
    }
  }

  return tabulationFilter;
}

export interface FilterEditorProps {
  onChange: (filter: Admin.ReportingFilter) => void;
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
              ariaLabel="Edit Filter Type"
            />
            <Predicate>equals</Predicate>
            <SearchSelect
              isMulti
              isSearchable
              key={filterType}
              options={generateOptionsForFilter({
                filterType,
                election,
                scannerBatches,
              })}
              value={row.filterValues}
              onChange={(filterValues) => {
                updateRowFilterValues(rowId, filterValues);
              }}
              ariaLabel="Select Filter Values"
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
              ariaLabel="Select New Filter Type"
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
