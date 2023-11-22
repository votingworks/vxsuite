import { P } from '@votingworks/ui';
import { useContext, useState } from 'react';
import { assert } from '@votingworks/basics';
import {
  isElectionManagerAuth,
  isFilterEmpty,
  isGroupByEmpty,
} from '@votingworks/utils';
import { Tabulation } from '@votingworks/types';
import { AppContext } from '../../contexts/app_context';
import { NavigationScreen } from '../../components/navigation_screen';
import {
  FilterEditor,
  FilterType,
} from '../../components/reporting/filter_editor';
import {
  GroupByEditor,
  GroupByType,
} from '../../components/reporting/group_by_editor';
import { canonicalizeFilter, canonicalizeGroupBy } from '../../utils/reporting';
import { BallotCountReportViewer } from '../../components/reporting/ballot_count_report_viewer';
import {
  ControlLabel,
  ReportBackButton,
  ReportBuilderControls,
} from '../../components/reporting/shared';

const SCREEN_TITLE = 'Ballot Count Report Builder';

export function BallotCountReportBuilder(): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth));
  const { election } = electionDefinition;

  const [filter, setFilter] = useState<Tabulation.Filter>({});
  const [groupBy, setGroupBy] = useState<Tabulation.GroupBy>({});

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

  const hasMadeSelections = !isFilterEmpty(filter) || !isGroupByEmpty(groupBy);
  return (
    <NavigationScreen title={SCREEN_TITLE}>
      <P style={{ marginBottom: '1rem' }}>
        <ReportBackButton />
      </P>
      <ReportBuilderControls>
        <div style={{ marginBottom: '1.5rem' }}>
          <ControlLabel>Filters</ControlLabel>
          <P>Restrict the report to ballots matching the criteria</P>
          <FilterEditor
            election={election}
            onChange={updateFilter}
            allowedFilters={allowedFilters}
          />
        </div>
        <div>
          <ControlLabel>Report By</ControlLabel>
          <P>Organize the results into multiple reports</P>
          <GroupByEditor
            groupBy={groupBy}
            setGroupBy={updateGroupBy}
            allowedGroupings={allowedGroupBys}
          />
        </div>
      </ReportBuilderControls>
      <BallotCountReportViewer
        filter={filter}
        groupBy={groupBy}
        disabled={!hasMadeSelections}
        autoGenerateReport={false}
      />
    </NavigationScreen>
  );
}
