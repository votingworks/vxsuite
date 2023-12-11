import { Admin, ElectionDefinition, Tabulation } from '@votingworks/types';

import { getDistrictById, getPrecinctById } from '@votingworks/utils';

import pluralize from 'pluralize';
import styled from 'styled-components';
import { Font } from '../typography';
import { getBatchLabel, getScannerLabel } from './utils';

interface Props {
  electionDefinition: ElectionDefinition;
  filter: Admin.FrontendReportingFilter;
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
          {filter.scannerIds.map(getScannerLabel).join(', ')}
        </FilterDisplayRow>
      )}
      {filter.batchIds && (
        <FilterDisplayRow>
          <Font weight="semiBold">
            {pluralize('Batch', filter.batchIds.length)}:
          </Font>{' '}
          {filter.batchIds.map(getBatchLabel).join(', ')}
        </FilterDisplayRow>
      )}
      {filter.adjudicationFlags && (
        <FilterDisplayRow>
          <Font weight="semiBold">
            {pluralize('Adjudication Status', filter.adjudicationFlags.length)}:
          </Font>{' '}
          {filter.adjudicationFlags
            .map((flag) => Admin.ADJUDICATION_FLAG_LABELS[flag])
            .join(', ')}
        </FilterDisplayRow>
      )}
      {filter.districtIds && (
        <FilterDisplayRow>
          <Font weight="semiBold">
            {pluralize('District', filter.districtIds.length)}:
          </Font>{' '}
          {filter.districtIds
            .map(
              (districtId) =>
                getDistrictById(electionDefinition, districtId).name
            )
            .join(', ')}
        </FilterDisplayRow>
      )}
    </div>
  );
}
