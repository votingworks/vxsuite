import React, { useState } from 'react';
import { Election, Id } from '@votingworks/types';
import { Button, H1, Icons } from '@votingworks/ui';
import { Buffer } from 'buffer';
import { useHistory, useParams } from 'react-router-dom';
import DomPurify from 'dompurify';
import { deleteElection, getElection, updateElection } from './api';
import { Form, FormField, Input, FormActionsRow } from './layout';
import { ElectionNavScreen } from './nav_screen';
import { routes } from './routes';
import { FileInputButton } from './file_input_button';
import { SegmentedControl } from './segmented_control';

type ElectionInfo = Pick<
  Election,
  'title' | 'date' | 'type' | 'state' | 'county' | 'seal'
>;

function hasBlankElectionInfo(election: Election): boolean {
  return (
    election.title === '' &&
    election.date === '' &&
    election.state === '' &&
    election.county.name === '' &&
    election.seal === ''
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
      <FormField label="Type">
        <SegmentedControl
          options={[
            { label: 'General', value: 'general' },
            { label: 'Primary', value: 'primary' },
          ]}
          value={electionInfo.type}
          onChange={(type) => setElectionInfo({ ...electionInfo, type })}
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
      <FormField label="Seal">
        {electionInfo.seal && (
          <img
            src={`data:image/svg+xml;base64,${Buffer.from(
              electionInfo.seal
            ).toString('base64')}`}
            alt="Seal"
            style={{ maxWidth: '10rem', marginBottom: '1rem' }}
          />
        )}
        {(isEditing || !electionInfo.seal) && (
          <FileInputButton
            accept="image/svg+xml"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) {
                return;
              }
              const reader = new FileReader();
              reader.onload = (e2) => {
                const svgContents = e2.target?.result;
                if (typeof svgContents === 'string') {
                  const seal = DomPurify.sanitize(svgContents, {
                    USE_PROFILES: { svg: true },
                  });
                  setElectionInfo({ ...electionInfo, seal });
                }
              };
              reader.readAsText(file);
            }}
            disabled={!isEditing}
          >
            Upload Seal Image
          </FileInputButton>
        )}
      </FormField>

      {isEditing ? (
        <FormActionsRow>
          <Button
            onPress={() => {
              setElectionInfo(savedElection);
              setIsEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onPress={onSaveButtonPress}
            disabled={updateElectionMutation.isLoading}
          >
            <Icons.Checkmark /> Save
          </Button>
        </FormActionsRow>
      ) : (
        <div>
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
              Delete Election
            </Button>
          </FormActionsRow>
        </div>
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
