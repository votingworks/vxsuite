import { Icons, LinkButton, P, SearchSelect } from '@votingworks/ui';
import { useContext, useState } from 'react';
import { assert } from '@votingworks/basics';
import { isElectionManagerAuth } from '@votingworks/utils';
import styled from 'styled-components';
import { AppContext } from '../../contexts/app_context';
import { NavigationScreen } from '../../components/navigation_screen';
import { routerPaths } from '../../router_paths';
import { TallyReportViewer } from '../../components/reporting/tally_report_viewer';

export const SCREEN_TITLE = 'Single Precinct Tally Report';

const SelectPrecinctContainer = styled.div`
  display: grid;
  grid-template-columns: min-content 30%;
  gap: 1rem;
  align-items: center;

  p {
    white-space: nowrap;
    margin: 0;
  }
`;

export function SinglePrecinctTallyReportScreen(): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for viewing tally reports.

  const [precinctId, setPrecinctId] = useState<string>();

  return (
    <NavigationScreen title={SCREEN_TITLE}>
      <P>
        <LinkButton small to={routerPaths.reports}>
          <Icons.Previous /> Back
        </LinkButton>
      </P>
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
        autoPreview
      />
    </NavigationScreen>
  );
}
