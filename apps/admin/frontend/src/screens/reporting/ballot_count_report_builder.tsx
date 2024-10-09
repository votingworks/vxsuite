import { P } from '@votingworks/ui';
import { useContext, useState } from 'react';
import { assert } from '@votingworks/basics';
import {
  getMaxSheetsPerBallot,
  isElectionManagerAuth,
  isGroupByEmpty,
} from '@votingworks/utils';
import { Admin, Tabulation } from '@votingworks/types';
import { AppContext } from '../../contexts/app_context';
import { NavigationScreen } from '../../components/navigation_screen';
import {
  FilterEditor,
  FilterType,
} from '../../components/reporting/filter_editor';
import {
  GroupByEditor,
  GroupByEditorOption,
} from '../../components/reporting/group_by_editor';
import {
  canonicalizeFilter,
  canonicalizeGroupBy,
  isFilterEmpty,
} from '../../utils/reporting';
import { BallotCountReportViewer } from '../../components/reporting/ballot_count_report_viewer';
import {
  ControlLabel,
  ReportBuilderControls,
  reportParentRoutes,
  ReportScreenContainer,
} from '../../components/reporting/shared';

export const TITLE = 'Ballot Count Report Builder';

export function BallotCountReportBuilder(): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth));
  const { election } = electionDefinition;

  const [filter, setFilter] = useState<Admin.FrontendReportingFilter>({});
  const [groupBy, setGroupBy] = useState<Tabulation.GroupBy>({});
  const [includeSheetCounts, setIncludeSheetCounts] = useState<boolean>(false);

  function updateFilter(newFilter: Admin.FrontendReportingFilter) {
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
    'adjudication-status',
    'district',
  ];
  const allowedGroupBys: GroupByEditorOption[] = [
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
  const maxSheetsPerBallot = getMaxSheetsPerBallot(election);
  if (maxSheetsPerBallot && maxSheetsPerBallot > 1) {
    allowedGroupBys.push('includeSheetCounts');
  }

  const hasMadeSelections = !isFilterEmpty(filter) || !isGroupByEmpty(groupBy);
  return (
    <NavigationScreen title={TITLE} parentRoutes={reportParentRoutes} noPadding>
      <ReportScreenContainer>
        <ReportBuilderControls>
          <div style={{ marginBottom: '1.5rem' }}>
            <ControlLabel>Filters</ControlLabel>
            <P>Restrict the report to ballots matching following criteria:</P>
            <FilterEditor
              election={election}
              onChange={updateFilter}
              allowedFilters={allowedFilters}
            />
          </div>
          <div>
            <ControlLabel>Report By</ControlLabel>
            <P>Organize the ballot counts into rows by the following:</P>
            <GroupByEditor
              groupBy={groupBy}
              setGroupBy={updateGroupBy}
              includeSheetCounts={includeSheetCounts}
              setIncludeSheetCounts={setIncludeSheetCounts}
              allowedOptions={allowedGroupBys}
            />
          </div>
        </ReportBuilderControls>
        <BallotCountReportViewer
          filter={filter}
          groupBy={groupBy}
          includeSheetCounts={includeSheetCounts}
          disabled={!hasMadeSelections}
          autoGenerateReport={false}
        />
      </ReportScreenContainer>
    </NavigationScreen>
  );
}
