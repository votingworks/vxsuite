import {
  Font,
  H3,
  Icons,
  LinkButton,
  P,
  SearchSelect,
  SelectOption,
} from '@votingworks/ui';
import { useContext, useState } from 'react';
import { assert } from '@votingworks/basics';
import {
  isElectionManagerAuth,
  isFilterEmpty,
  isGroupByEmpty,
} from '@votingworks/utils';
import { Tabulation } from '@votingworks/types';
import styled from 'styled-components';
import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';
import {
  FilterEditor,
  FilterType,
} from '../components/reporting/filter_editor';
import {
  GroupByEditor,
  GroupByType,
} from '../components/reporting/group_by_editor';
import { canonicalizeFilter, canonicalizeGroupBy } from '../utils/reporting';
import { BallotCountReportViewer } from '../components/reporting/ballot_count_report_viewer';
import { getManualResultsMetadata } from '../api';

const SCREEN_TITLE = 'Ballot Count Report Builder';

const FilterEditorContainer = styled.div`
  width: 80%;
  margin-bottom: 2rem;
`;

const GroupByEditorContainer = styled.div`
  width: 80%;
  margin-top: 0.5rem;
  margin-bottom: 2rem;
`;

const BreakdownSelectContainer = styled.div`
  display: grid;
  grid-template-columns: min-content 20%;
  align-items: center;
  gap: 1rem;
  margin-top: 0.5rem;
  margin-bottom: 2rem;
  white-space: nowrap;
`;

export function BallotCountReportBuilder(): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for viewing reports.
  const { election } = electionDefinition;

  const getManualResultsMetadataQuery = getManualResultsMetadata.useQuery();

  const [filter, setFilter] = useState<Tabulation.Filter>({});
  const [groupBy, setGroupBy] = useState<Tabulation.GroupBy>({});
  const [breakdown, setBreakdown] =
    useState<Tabulation.BallotCountBreakdown>('none');

  function updateFilter(newFilter: Tabulation.Filter) {
    setFilter(canonicalizeFilter(newFilter));
  }

  function updateGroupBy(newGroupBy: Tabulation.GroupBy) {
    setGroupBy(canonicalizeGroupBy(newGroupBy));
  }

  const allowedFilters: FilterType[] = [
    'ballot-style',
    'batch',
    'precinct',
    'scanner',
    'voting-method',
  ];
  const allowedGroupBys: GroupByType[] = [
    'groupByBallotStyle',
    'groupByBatch',
    'groupByPrecinct',
    'groupByScanner',
    'groupByVotingMethod',
  ];
  if (electionDefinition.election.type === 'primary') {
    allowedFilters.push('party');
    allowedGroupBys.push('groupByParty');
  }

  const breakdownOptions: Array<SelectOption<Tabulation.BallotCountBreakdown>> =
    [
      {
        value: 'none',
        label: 'None',
      },
      {
        value: 'all',
        label: 'Full',
      },
    ];
  if (
    getManualResultsMetadataQuery.data &&
    getManualResultsMetadataQuery.data.length > 0
  ) {
    breakdownOptions.push({
      value: 'manual',
      label: 'Manual',
    });
  }

  const hasMadeSelections = !isFilterEmpty(filter) || !isGroupByEmpty(groupBy);
  return (
    <NavigationScreen title={SCREEN_TITLE}>
      <P>
        <LinkButton small to={routerPaths.reports}>
          <Icons.Previous /> Back
        </LinkButton>
      </P>
      <P>
        Use the report builder to create custom reports for print or export.
      </P>
      <ul>
        <li>
          <Font weight="bold">Filters</Font> restrict the report to ballots
          matching the criteria
        </li>
        <li>
          <Font weight="bold">Report By</Font> organizes the ballot counts into
          multiple rows
        </li>
      </ul>
      <H3>Filters</H3>
      <FilterEditorContainer>
        <FilterEditor
          election={election}
          onChange={updateFilter}
          allowedFilters={allowedFilters}
        />
      </FilterEditorContainer>
      <H3>Report By</H3>
      <GroupByEditorContainer>
        <GroupByEditor
          groupBy={groupBy}
          setGroupBy={updateGroupBy}
          allowedGroupings={allowedGroupBys}
        />
      </GroupByEditorContainer>
      <H3>Options</H3>

      <BreakdownSelectContainer>
        <Font>Ballot Count Breakdown:</Font>
        <SearchSelect
          isMulti={false}
          isSearchable={false}
          value={breakdown}
          options={breakdownOptions}
          onChange={(value) =>
            setBreakdown(value as Tabulation.BallotCountBreakdown)
          }
          ariaLabel="Select Breakdown Type"
        />
      </BreakdownSelectContainer>
      <BallotCountReportViewer
        filter={filter}
        groupBy={groupBy}
        ballotCountBreakdown={breakdown}
        disabled={!hasMadeSelections}
        autoPreview={false}
      />
    </NavigationScreen>
  );
}
