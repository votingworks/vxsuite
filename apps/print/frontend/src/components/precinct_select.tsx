import { Precinct, PrecinctId } from '@votingworks/types';
import React from 'react';
import { ExpandedSelect } from './expanded_select';

interface PrecinctSelectProps {
  searchValue?: string;
  selectedPrecinctId: PrecinctId;
  precincts: readonly Precinct[];
  onSearch: (precinctSearch: string) => void;
  onSelect: (precinctId: string) => void;
}
export function PrecinctSelect({
  searchValue,
  selectedPrecinctId,
  precincts,
  onSearch,
  onSelect,
}: PrecinctSelectProps): JSX.Element | null {
  return (
    <React.Fragment>
      <strong>Precinct</strong>
      <ExpandedSelect
        selectedValue={selectedPrecinctId}
        options={precincts
          .filter(
            (p) =>
              !searchValue ||
              // @coverage-defer
              p.name.toLowerCase().includes(searchValue.toLowerCase())
          )
          .map((p) => ({ value: p.id, label: p.name }))}
        onSearch={onSearch}
        onSelect={onSelect}
      />
    </React.Fragment>
  );
}
