import {
  assert,
  throwIllegalValue,
  typedAs,
  unique,
} from '@votingworks/basics';
import { Election, Tabulation } from '@votingworks/types';
import { useState } from 'react';
import styled from 'styled-components';
import { SearchSelect, SelectOption, Icons, Button } from '@votingworks/ui';
import type { ScannerBatch } from '@votingworks/admin-backend';
import { getScannerBatches } from '../../api';

export interface FilterEditorProps {
  onChange: (filter: Tabulation.Filter) => void;
  election: Election;
}

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
  grid-template-columns: 10rem 4rem 1fr 2rem;
`;

const AddSelectFilterContainer = styled.div`
  width: 100%;
  align-self: start;
  margin-top: 0.1rem;
  min-height: 3rem;
`;

const Predicate = styled.div`
  justify-self: center;
  display: flex;
  margin-top: 0.5rem;
`;

const FilterValueSelectContainer = styled.div`
  align-self: starts;
`;

const AddButton = styled(Button)`
  min-width: 6rem;
`;

const RemoveButton = styled.button`
  width: 1.5rem;
  height: 1.5rem;
  align-self: start;
  margin-top: 0.3rem;
  background: none;
  border: none;
  border-radius: 0.25rem;
  color: ${(p) => p.theme.colors.foreground};
  line-height: 0rem;

  :focus-visible {
    outline: ${(p) => p.theme.sizes.bordersRem.thin}rem dashed
      ${(p) => p.theme.colors.foreground};
  }
`;

const FILTER_TYPES = [
  'precinct',
  'voting-method',
  'ballot-style',
  'scanner',
  'batch',
] as const;
type FilterType = (typeof FILTER_TYPES)[number];

function getAllowedFilterTypes(): FilterType[] {
  return ['precinct', 'voting-method', 'ballot-style', 'scanner', 'batch'];
}

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
    /* istanbul ignore next - compile-time check for completeness */
    default:
      throwIllegalValue(filterType);
  }
}

// allow modifying filter during construction for convenience
type Writeable<T> = { -readonly [P in keyof T]: T[P] };

function convertFilterRowsToTabulationFilter(
  rows: FilterRows
): Tabulation.Filter {
  const tabulationFilter: Writeable<Tabulation.Filter> = {};
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
      case 'scanner':
        tabulationFilter.scannerIds = filterValues;
        break;
      case 'batch':
        tabulationFilter.batchIds = filterValues;
        break;
      /* istanbul ignore next - compile-time check for completeness */
      default:
        throwIllegalValue(filterType);
    }
  }

  return tabulationFilter;
}

export function FilterEditor({
  onChange,
  election,
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
  const unusedFilters: FilterType[] = getAllowedFilterTypes().filter(
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
            <AddSelectFilterContainer>
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
            </AddSelectFilterContainer>
            <Predicate>equals</Predicate>
            <FilterValueSelectContainer>
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
            </FilterValueSelectContainer>
            <RemoveButton
              onClick={() => deleteRow(rowId)}
              aria-label="Remove Filter"
            >
              <Icons.X />
            </RemoveButton>
          </FilterRow>
        );
      })}
      {unusedFilters.length > 0 && (
        <FilterRow key="new-row">
          <AddSelectFilterContainer>
            {isAddingRow ? (
              <SearchSelect
                key={nextRowId}
                isMulti={false}
                isSearchable={false}
                options={unusedFilters
                  .filter(
                    (filterType) =>
                      !rows.some((r) => r.filterType === filterType)
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
              <AddButton onPress={() => setIsAddingRow(true)}>
                <Icons.AddCircle /> Add Filter
              </AddButton>
            )}
          </AddSelectFilterContainer>
          {isAddingRow && (
            <RemoveButton
              onClick={() => setIsAddingRow(false)}
              aria-label="Cancel Add Filter"
            >
              <Icons.X />
            </RemoveButton>
          )}
        </FilterRow>
      )}
    </FilterEditorContainer>
  );
}
