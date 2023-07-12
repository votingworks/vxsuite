import React, { useState } from 'react';
import { Election, Id } from '@votingworks/types';
import { Button, H1, Icons } from '@votingworks/ui';
import { useHistory, useParams } from 'react-router-dom';
import { deleteElection, getElection, updateElection } from './api';
import { Form, FormField, Input, FormActionsRow } from './layout';
import { ElectionNavScreen } from './nav_screen';
import { routes } from './routes';

type ElectionInfo = Pick<
  Election,
  'title' | 'date' | 'state' | 'county' | 'sealUrl'
>;

function hasBlankElectionInfo(election: Election): boolean {
  return (
    election.title === '' &&
    election.date === '' &&
    election.state === '' &&
    election.county.name === ''
  );
}

function ElectionInfoForm({
  electionId,
  savedElection,
}: {
  electionId: Id;
  savedElection: Election;
}): JSX.Element {
  const [isEditing, setIsEditing] = useState(
    // Default to editing for newly created elections
    hasBlankElectionInfo(savedElection)
  );
  const [electionInfo, setElectionInfo] = useState<ElectionInfo>(savedElection);
  const updateElectionMutation = updateElection.useMutation();
  const deleteElectionMutation = deleteElection.useMutation();
  const history = useHistory();

  function onSaveButtonPress() {
    updateElectionMutation.mutate(
      { electionId, election: { ...savedElection, ...electionInfo } },
      { onSuccess: () => setIsEditing(false) }
    );
  }

  function onInputChange(field: keyof ElectionInfo) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setElectionInfo((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }

  function onDeletePress() {
    deleteElectionMutation.mutate(
      { electionId },
      {
        onSuccess: () => {
          history.push(routes.root.path);
        },
      }
    );
  }

  return (
    <Form>
      <FormField label="Title">
        <Input
          type="text"
          value={electionInfo.title}
          onChange={onInputChange('title')}
          disabled={!isEditing}
        />
      </FormField>
      <FormField label="Date">
        <Input
          type="date"
          value={
            electionInfo.date &&
            new Date(electionInfo.date).toISOString().slice(0, 10)
          }
          onChange={onInputChange('date')}
          disabled={!isEditing}
        />
      </FormField>
      <FormField label="State">
        <Input
          type="text"
          value={electionInfo.state}
          onChange={onInputChange('state')}
          disabled={!isEditing}
        />
      </FormField>
      <FormField label="County">
        <Input
          type="text"
          value={electionInfo.county.name}
          onChange={(e) =>
            setElectionInfo({
              ...electionInfo,
              county: {
                name: e.target.value,
                id: 'county-id',
              },
            })
          }
          disabled={!isEditing}
        />
      </FormField>
      {isEditing ? (
        <FormActionsRow>
          <Button onPress={() => setIsEditing(false)}>Cancel</Button>
          <Button
            variant="primary"
            onPress={onSaveButtonPress}
            disabled={updateElectionMutation.isLoading}
          >
            <Icons.Checkmark /> Save
          </Button>
        </FormActionsRow>
      ) : (
        <React.Fragment>
          <FormActionsRow>
            <Button variant="primary" onPress={() => setIsEditing(true)}>
              <Icons.Edit /> Edit
            </Button>
          </FormActionsRow>
          <FormActionsRow style={{ marginTop: '1rem' }}>
            <Button
              variant="danger"
              onPress={onDeletePress}
              disabled={deleteElectionMutation.isLoading}
            >
              <Icons.DangerX /> Delete Election
            </Button>
          </FormActionsRow>
        </React.Fragment>
      )}
    </Form>
  );
}

export function ElectionInfoScreen(): JSX.Element | null {
  const { electionId } = useParams<{ electionId: string }>();
  const getElectionQuery = getElection.useQuery(electionId);

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { election } = getElectionQuery.data;

  return (
    <ElectionNavScreen electionId={electionId}>
      <H1>Election Info</H1>
      <ElectionInfoForm electionId={electionId} savedElection={election} />
    </ElectionNavScreen>
  );
}
