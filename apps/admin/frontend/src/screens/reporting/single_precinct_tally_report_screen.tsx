import { SearchSelect } from '@votingworks/ui';
import { useContext, useState } from 'react';
import { assert } from '@votingworks/basics';
import { isElectionManagerAuth } from '@votingworks/utils';
import styled from 'styled-components';
import { AppContext } from '../../contexts/app_context';
import { NavigationScreen } from '../../components/navigation_screen';
import { TallyReportViewer } from '../../components/reporting/tally_report_viewer';
import {
  reportParentRoutes,
  ReportScreenContainer,
} from '../../components/reporting/shared';

export const TITLE = 'Single Precinct Tally Report';

const SelectPrecinctContainer = styled.div`
  padding: 1rem 1rem 0;
  display: flex;
  gap: 0.5rem;
  align-items: center;

  > span {
    white-space: nowrap;
  }
`;

export function SinglePrecinctTallyReportScreen(): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  assert(isElectionManagerAuth(auth));

  const [precinctId, setPrecinctId] = useState<string>();

  return (
    <NavigationScreen title={TITLE} parentRoutes={reportParentRoutes} noPadding>
      <ReportScreenContainer>
        <SelectPrecinctContainer>
          <SearchSelect
            isMulti={false}
            isSearchable
            value={precinctId}
            options={election.precincts.map((precinct) => ({
              value: precinct.id,
              label: precinct.name,
            }))}
            onChange={(value) => setPrecinctId(value)}
            ariaLabel="Select Precinct"
            style={{ width: '30rem' }}
            placeholder="Select Precinct..."
          />
        </SelectPrecinctContainer>
        <TallyReportViewer
          filter={{ precinctIds: precinctId ? [precinctId] : [] }}
          groupBy={{}}
          disabled={!precinctId}
          autoGenerateReport
        />
      </ReportScreenContainer>
    </NavigationScreen>
  );
}
