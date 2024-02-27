import { Result } from '@votingworks/basics';
import { Id } from '@votingworks/types';
import {
  H1,
  P,
  Icons,
  Button,
  MainContent,
  MainHeader,
  FileInputButton,
  Table,
} from '@votingworks/ui';
import { FormEvent } from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { format } from '@votingworks/utils';
import { listElections, createElection } from './api';
import { Column, Row } from './layout';
import { NavScreen } from './nav_screen';

const ButtonRow = styled.tr`
  cursor: pointer;

  & td {
    padding: 0.75rem 0.5rem;
  }

  &:hover {
    background-color: ${(p) => p.theme.colors.containerLow};
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
      <MainHeader>
        <H1>Elections</H1>
      </MainHeader>
      <MainContent>
        <Column style={{ gap: '1rem' }}>
          {elections.length === 0 ? (
            <P>
              <Icons.Info /> You haven&apos;t created any elections yet.
            </P>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Date</th>
                  <th>Jurisdiction</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {elections.map(({ id, election }) => (
                  <ButtonRow
                    key={id}
                    onClick={() => history.push(`/elections/${id}`)}
                  >
                    <td>{election.title || 'Untitled Election'}</td>
                    <td>
                      {election.date &&
                        format.localeLongDate(
                          new Date(
                            election.date.toMidnightDatetimeWithSystemTimezone()
                          )
                        )}
                    </td>
                    <td>{election.county.name}</td>
                    <td>{election.state}</td>
                  </ButtonRow>
                ))}
              </tbody>
            </Table>
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
      </MainContent>
    </NavScreen>
  );
}
