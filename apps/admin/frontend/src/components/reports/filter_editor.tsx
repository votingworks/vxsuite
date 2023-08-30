import { assert, throwIllegalValue, typedAs } from '@votingworks/basics';
import {
  Election,
  PartyId,
  Tabulation,
  electionHasPrimaryContest,
} from '@votingworks/types';
import { useState } from 'react';
import styled from 'styled-components';
import { SearchSelect, SelectOption, Icons, Button } from '@votingworks/ui';
import { canonicalizeCustomReportFilter } from '@votingworks/utils';

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
  margin-top: 0.25rem;
  align-self: start;
`;

const Predicate = styled.div`
  align-self: start;
  min-height: ${(p) => p.theme.sizes.minTouchAreaSizePx}px;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const FilterValueSelectContainer = styled.div`
  align-self: center;
`;

const AddButton = styled(Button)`
  min-width: 6rem;
`;

const RemoveButton = styled.button`
  width: 1.5rem;
  height: 1.5rem;
  justify-self: start;
  align-self: center;
  margin: ${(p) => p.theme.sizes.bordersRem.medium}rem;
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
  'party',
  'ballot-style',
] as const;
type FilterType = typeof FILTER_TYPES[number];

function getAllowedFilterTypes(election: Election): FilterType[] {
  const allowedFilterTypes: FilterType[] = [
    'precinct',
    'voting-method',
    'ballot-style',
  ];

  if (electionHasPrimaryContest(election)) {
    allowedFilterTypes.push('party');
  }

  return allowedFilterTypes;
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
  party: 'Party',
  'ballot-style': 'Ballot Style',
};

function getFilterTypeOption(filterType: FilterType): SelectOption<FilterType> {
  return {
    value: filterType,
    label: FILTER_TYPE_LABELS[filterType],
  };
}

function generateOptionsForFilter(
  filterType: FilterType,
  election: Election
): SelectOption[] {
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
    case 'party': {
      const relevantPartyIds = new Set(
        election.ballotStyles
          .map((bs) => bs.partyId)
          .filter((partyId): partyId is PartyId => partyId !== undefined)
      );
      return election.parties
        .filter((party) => relevantPartyIds.has(party.id))
        .map((party) => ({ value: party.id, label: party.name }));
    }
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
      case 'party':
        tabulationFilter.partyIds = filterValues;
        break;
      case 'ballot-style':
        tabulationFilter.ballotStyleIds = filterValues;
        break;
      default:
        throwIllegalValue(filterType);
    }
  }

  return canonicalizeCustomReportFilter(tabulationFilter);
}

export function FilterEditor({
  onChange,
  election,
}: FilterEditorProps): JSX.Element {
  const [rows, setRows] = useState<FilterRows>([]);
  const [nextRowId, setNextRowId] = useState(0);
  const [isAddingRow, setIsAddingRow] = useState(false);

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
  const unusedFilters: FilterType[] = getAllowedFilterTypes(election).filter(
    (filterType) => !activeFilters.includes(filterType)
  );

  return (
    <FilterEditorContainer>
      {rows.map((row) => {
        const { filterType, rowId } = row;
        return (
          <FilterRow key={rowId}>
            <AddSelectFilterContainer data-testid="mecontainer">
              <SearchSelect
                isMulti={false}
                isSearchable={false}
                value={filterType}
                options={[
                  getFilterTypeOption(filterType),
                  ...unusedFilters.map(getFilterTypeOption),
                ]}
                onChange={(filterTypeOption) => {
                  assert(filterTypeOption);
                  const newFilterType = filterTypeOption.value;
                  updateRowFilterType(rowId, newFilterType);
                }}
              />
            </AddSelectFilterContainer>
            <Predicate>equals</Predicate>
            <FilterValueSelectContainer>
              <SearchSelect
                isMulti
                isSearchable
                key={filterType}
                options={generateOptionsForFilter(filterType, election)}
                value={row.filterValues}
                onChange={(filterValueOptions) => {
                  updateRowFilterValues(
                    rowId,
                    filterValueOptions.map((o) => o.value)
                  );
                }}
              />
            </FilterValueSelectContainer>
            <RemoveButton onClick={() => deleteRow(rowId)}>
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
                options={FILTER_TYPES.filter(
                  (filterType) => !rows.some((r) => r.filterType === filterType)
                ).map((filterType) => getFilterTypeOption(filterType))}
                onChange={(filterTypeOption) => {
                  assert(filterTypeOption);
                  const filterType = filterTypeOption.value;
                  addRow(filterType);
                  setIsAddingRow(false);
                }}
              />
            ) : (
              <AddButton onPress={() => setIsAddingRow(true)}>
                <Icons.AddCircle /> Add Filter
              </AddButton>
            )}
          </AddSelectFilterContainer>
          {isAddingRow && (
            <RemoveButton onClick={() => setIsAddingRow(false)}>
              <Icons.X />
            </RemoveButton>
          )}
        </FilterRow>
      )}
    </FilterEditorContainer>
  );
}
