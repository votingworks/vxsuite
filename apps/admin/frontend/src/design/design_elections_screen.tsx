import { useHistory } from 'react-router-dom';
import type { StateCode } from '@votingworks/design-backend';
import {
  createElection,
  generateId,
  listElections,
  routes,
} from '@votingworks/design-ui';
import {
  Button,
  H2,
  LinkButton,
  P,
  SearchSelect,
  Table,
  TD,
  TH,
} from '@votingworks/ui';
import { NavigationScreen } from '../components/navigation_screen.js';
import {
  getDesignStateCode,
  getLocalJurisdictionId,
  listStateCodes,
  setDesignStateCode,
} from './design_api.js';

function StateSelect(): JSX.Element | null {
  const stateCodeQuery = getDesignStateCode.useQuery();
  const stateCodesQuery = listStateCodes.useQuery();
  const setStateCodeMutation = setDesignStateCode.useMutation();
  if (!stateCodeQuery.isSuccess || !stateCodesQuery.isSuccess) return null;
  return (
    <div style={{ maxWidth: '16rem' }}>
      <SearchSelect<StateCode>
        aria-label="State"
        options={stateCodesQuery.data.map((stateCode) => ({
          value: stateCode,
          label: stateCode,
        }))}
        value={stateCodeQuery.data}
        onChange={(stateCode) => {
          if (stateCode) {
            setStateCodeMutation.mutate({ stateCode });
          }
        }}
        disabled={setStateCodeMutation.isLoading}
      />
    </div>
  );
}

export function DesignElectionsScreen(): JSX.Element | null {
  const history = useHistory();
  const listElectionsQuery = listElections.useQuery();
  const jurisdictionIdQuery = getLocalJurisdictionId.useQuery();
  const createElectionMutation = createElection.useMutation();

  if (!listElectionsQuery.isSuccess || !jurisdictionIdQuery.isSuccess) {
    return null;
  }

  function onCreateElection() {
    const id = generateId();
    createElectionMutation.mutate(
      { id, jurisdictionId: jurisdictionIdQuery.data ?? '' },
      {
        onSuccess: (result) => {
          if (result.isOk()) {
            history.push(routes.election(result.ok()).electionInfo.root.path);
          }
        },
      }
    );
  }

  const elections = listElectionsQuery.data;

  return (
    <NavigationScreen title="Election Design">
      <H2>State</H2>
      <StateSelect />
      <H2>Elections</H2>
      <P>
        <Button
          icon="Add"
          variant="primary"
          onPress={onCreateElection}
          disabled={createElectionMutation.isLoading}
        >
          Create Election
        </Button>
      </P>
      {elections.length === 0 ? (
        <P>No elections yet.</P>
      ) : (
        <Table>
          <thead>
            <tr>
              <TH>Title</TH>
              <TH>Date</TH>
              <TH>Status</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {elections.map((election) => (
              <tr key={election.electionId}>
                <TD>{election.title || 'Untitled Election'}</TD>
                <TD>
                  {election.date
                    .toMidnightDatetimeWithSystemTimezone()
                    .toLocaleDateString()}
                </TD>
                <TD>{election.status}</TD>
                <TD>
                  <LinkButton
                    to={
                      routes.election(election.electionId).electionInfo.root
                        .path
                    }
                  >
                    Open
                  </LinkButton>
                </TD>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </NavigationScreen>
  );
}
