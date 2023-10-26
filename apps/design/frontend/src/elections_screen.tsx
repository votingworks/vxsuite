import { Result } from '@votingworks/basics';
import { Id } from '@votingworks/types';
import { H1, P, Icons, LinkButton, Button } from '@votingworks/ui';
import { FormEvent } from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { listElections, createElection } from './api';
import { FileInputButton } from './file_input_button';
import { Column, Row } from './layout';
import { NavScreen } from './nav_screen';

const ElectionList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  li {
    button {
      width: 100%;
      text-align: left;
    }
  }
`;

export function ElectionsScreen(): JSX.Element | null {
  const listElectionsQuery = listElections.useQuery();
  const createElectionMutation = createElection.useMutation();
  const history = useHistory();

  function onCreateElectionSuccess(result: Result<Id, Error>) {
    if (result.isOk()) {
      const electionId = result.ok();
      history.push(`/elections/${electionId}`);
      return;
    }
    // TODO handle error case
    throw result.err();
  }

  async function onSelectElectionFile(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    const file = files[0];
    const electionData = await file.text();
    createElectionMutation.mutate(
      { electionData },
      { onSuccess: onCreateElectionSuccess }
    );
  }

  function onCreateElectionPress() {
    createElectionMutation.mutate(
      { electionData: undefined },
      { onSuccess: onCreateElectionSuccess }
    );
  }

  if (!listElectionsQuery.isSuccess) {
    return null;
  }
  const elections = listElectionsQuery.data;

  return (
    <NavScreen>
      <H1>Elections</H1>
      <Column style={{ gap: '1rem', width: '25rem' }}>
        {elections.length === 0 ? (
          <P>
            <Icons.Info /> You haven&apos;t created any elections yet.
          </P>
        ) : (
          <ElectionList>
            {elections.map(({ id, election }) => (
              <li key={id}>
                <LinkButton to={`/elections/${id}`}>
                  {election.title
                    ? election.title +
                      (election.date
                        ? ` - ${new Date(election.date).toLocaleDateString()}`
                        : '')
                    : 'Untitled Election'}
                </LinkButton>
              </li>
            ))}
          </ElectionList>
        )}
        <Row style={{ gap: '0.5rem' }}>
          <Button
            variant={elections.length === 0 ? 'primary' : undefined}
            icon="Add"
            onPress={onCreateElectionPress}
            disabled={createElectionMutation.isLoading}
          >
            Create Election
          </Button>
          <FileInputButton
            accept=".json"
            onChange={onSelectElectionFile}
            disabled={createElectionMutation.isLoading}
          >
            Load Election
          </FileInputButton>
        </Row>
      </Column>
    </NavScreen>
  );
}
