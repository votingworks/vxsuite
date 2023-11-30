import { P, SearchSelect } from '@votingworks/ui';
import { useContext, useState } from 'react';
import { assert } from '@votingworks/basics';
import { isElectionManagerAuth } from '@votingworks/utils';
import styled from 'styled-components';
import { AppContext } from '../../contexts/app_context';
import { NavigationScreen } from '../../components/navigation_screen';
import { TallyReportViewer } from '../../components/reporting/tally_report_viewer';
import { reportParentRoutes } from '../../components/reporting/shared';

export const TITLE = 'Single Precinct Tally Report';

const SelectPrecinctContainer = styled.div`
  display: grid;
  grid-template-columns: min-content 30%;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;

  p {
    white-space: nowrap;
    margin: 0;
  }
`;

export function SinglePrecinctTallyReportScreen(): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  assert(isElectionManagerAuth(auth));

  const [precinctId, setPrecinctId] = useState<string>();

  return (
    <NavigationScreen title={TITLE} parentRoutes={reportParentRoutes}>
      <SelectPrecinctContainer>
        <P>Select Precinct:</P>
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
        />
      </SelectPrecinctContainer>
      <TallyReportViewer
        filter={{ precinctIds: precinctId ? [precinctId] : [] }}
        groupBy={{}}
        disabled={!precinctId}
        autoGenerateReport
      />
    </NavigationScreen>
  );
}
