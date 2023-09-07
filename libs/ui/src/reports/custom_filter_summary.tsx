import { ElectionDefinition, Tabulation } from '@votingworks/types';

import { getPrecinctById } from '@votingworks/utils';

import pluralize from 'pluralize';
import styled from 'styled-components';
import { Font } from '../typography';

interface Props {
  electionDefinition: ElectionDefinition;
  filter: Tabulation.Filter;
}

const FilterDisplayRow = styled.p`
  margin: 0;
`;

export function CustomFilterSummary({
  electionDefinition,
  filter,
}: Props): JSX.Element {
  return (
    <div data-testid="custom-filter-summary">
      {filter.votingMethods && (
        <FilterDisplayRow>
          <Font weight="semiBold">
            {pluralize('Voting Method', filter.votingMethods.length)}:
          </Font>{' '}
          {filter.votingMethods
            .map(
              (votingMethod) => Tabulation.VOTING_METHOD_LABELS[votingMethod]
            )
            .join(', ')}
        </FilterDisplayRow>
      )}
      {filter.precinctIds && (
        <FilterDisplayRow>
          <Font weight="semiBold">
            {pluralize('Precinct', filter.precinctIds.length)}:
          </Font>{' '}
          {filter.precinctIds
            .map(
              (precinctId) =>
                getPrecinctById(electionDefinition, precinctId).name
            )
            .join(', ')}
        </FilterDisplayRow>
      )}
      {filter.ballotStyleIds && (
        <FilterDisplayRow>
          <Font weight="semiBold">
            {pluralize('Ballot Style', filter.ballotStyleIds.length)}:
          </Font>{' '}
          {filter.ballotStyleIds.join(', ')}
        </FilterDisplayRow>
      )}
      {filter.scannerIds && (
        <FilterDisplayRow>
          <Font weight="semiBold">
            {pluralize('Scanner', filter.scannerIds.length)}:
          </Font>{' '}
          {filter.scannerIds.join(', ')}
        </FilterDisplayRow>
      )}
      {filter.batchIds && (
        <FilterDisplayRow>
          <Font weight="semiBold">
            {pluralize('Batch', filter.batchIds.length)}:
          </Font>{' '}
          {filter.batchIds.map((id) => id.slice(0, 8)).join(', ')}
        </FilterDisplayRow>
      )}
    </div>
  );
}
