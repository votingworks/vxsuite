import React, { useState } from 'react';
import { ElectionIdSchema, unsafeParse } from '@votingworks/types';
import {
  Button,
  H1,
  MainContent,
  MainHeader,
  SegmentedButton,
} from '@votingworks/ui';
import type { ElectionInfo } from '@votingworks/design-backend';
import { useHistory, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { z } from 'zod';
import { DateWithoutTime } from '@votingworks/basics';
import {
  deleteElection,
  getBallotsFinalizedAt,
  getElectionInfo,
  updateElectionInfo,
} from './api';
import { FieldName, Form, FormActionsRow, InputGroup } from './layout';
import { ElectionNavScreen } from './nav_screen';
import { routes } from './routes';
import { ImageInput } from './image_input';

const SealImageInput = styled(ImageInput)`
  img {
    width: 10rem;
  }
`;

function hasBlankElectionInfo(electionInfo: ElectionInfo): boolean {
  return (
    !electionInfo.title &&
    !electionInfo.state &&
    !electionInfo.jurisdiction &&
    !electionInfo.seal
  );
}

function ElectionInfoForm({
  savedElectionInfo,
  ballotsFinalizedAt,
}: {
  savedElectionInfo: ElectionInfo;
  ballotsFinalizedAt: Date | null;
}): JSX.Element {
  const [isEditing, setIsEditing] = useState(
    // Default to editing for newly created elections
    hasBlankElectionInfo(savedElectionInfo)
  );
  const [editedElectionInfo, setEditedElectionInfo] =
    useState(savedElectionInfo);
  const updateElectionInfoMutation = updateElectionInfo.useMutation();
  const deleteElectionMutation = deleteElection.useMutation();
  const history = useHistory();
  const electionInfo = isEditing
    ? editedElectionInfo ?? savedElectionInfo
    : savedElectionInfo;

  function resetForm() {
    setIsEditing(false);
    setEditedElectionInfo(savedElectionInfo);
  }

  function onSubmit() {
    updateElectionInfoMutation.mutate(electionInfo, {
      onSuccess: resetForm,
    });
  }

  function onReset() {
    if (isEditing) {
      resetForm();
    } else {
      setEditedElectionInfo(savedElectionInfo);
      setIsEditing(true);
    }
  }

  type TextProperties = Exclude<keyof ElectionInfo, 'date' | 'electionId'>;

  function onInputChange(field: TextProperties) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setEditedElectionInfo((prev = savedElectionInfo) => ({
        ...prev,
        [field]: e.target.value,
      }));
    };
  }

  function onInputBlur(field: TextProperties) {
    return () => {
      setEditedElectionInfo((prev = savedElectionInfo) => ({
        ...prev,
        [field]: prev[field]?.trim(),
      }));
    };
  }

  function onDeletePress() {
    deleteElectionMutation.mutate(
      { electionId: electionInfo.electionId },
      {
        onSuccess: () => {
          history.push(routes.root.path);
        },
      }
    );
  }

  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onReset={(e) => {
        e.preventDefault();
        onReset();
      }}
    >
      <InputGroup label="Title">
        <input
          type="text"
          value={electionInfo.title}
          onChange={onInputChange('title')}
          onBlur={onInputBlur('title')}
          disabled={!isEditing}
          autoComplete="off"
          required
        />
      </InputGroup>
      <InputGroup label="Date">
        <input
          type="date"
          value={electionInfo.date.toISOString()}
          onChange={(e) =>
            setEditedElectionInfo({
              ...electionInfo,
              date: new DateWithoutTime(e.target.value),
            })
          }
          disabled={!isEditing}
        />
      </InputGroup>
      <SegmentedButton
        label="Type"
        options={[
          { label: 'General', id: 'general' },
          { label: 'Primary', id: 'primary' },
        ]}
        selectedOptionId={electionInfo.type}
        onChange={(type) => setEditedElectionInfo({ ...electionInfo, type })}
        disabled={!isEditing}
      />
      <InputGroup label="State">
        <input
          type="text"
          value={electionInfo.state}
          onChange={onInputChange('state')}
          onBlur={onInputBlur('state')}
          disabled={!isEditing}
          autoComplete="off"
          required
        />
      </InputGroup>
      <InputGroup label="Jurisdiction">
        <input
          type="text"
          value={electionInfo.jurisdiction}
          onChange={onInputChange('jurisdiction')}
          onBlur={onInputBlur('jurisdiction')}
          disabled={!isEditing}
          autoComplete="off"
          required
        />
      </InputGroup>
      <div>
        <FieldName>Seal</FieldName>
        <SealImageInput
          value={electionInfo.seal}
          onChange={(seal) => setEditedElectionInfo({ ...electionInfo, seal })}
          disabled={!isEditing}
          buttonLabel="Upload Seal Image"
          required
        />
      </div>

      {isEditing ? (
        <FormActionsRow>
          <Button type="reset">Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            icon="Done"
            disabled={updateElectionInfoMutation.isLoading}
          >
            Save
          </Button>
        </FormActionsRow>
      ) : (
        <div>
          <FormActionsRow>
            <Button
              type="reset"
              variant="primary"
              icon="Edit"
              disabled={!!ballotsFinalizedAt}
            >
              Edit
            </Button>
          </FormActionsRow>
          <FormActionsRow style={{ marginTop: '1rem' }}>
            <Button
              variant="danger"
              icon="Delete"
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
  const params = useParams<{ electionId: string }>();
  const { electionId } = unsafeParse(
    z.object({ electionId: ElectionIdSchema }),
    params
  );
  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  if (
    !getElectionInfoQuery.isSuccess ||
    !getBallotsFinalizedAtQuery.isSuccess
  ) {
    return null;
  }
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;

  return (
    <ElectionNavScreen electionId={electionId}>
      <MainHeader>
        <H1>Election Info</H1>
      </MainHeader>
      <MainContent>
        <ElectionInfoForm
          savedElectionInfo={getElectionInfoQuery.data}
          ballotsFinalizedAt={ballotsFinalizedAt}
        />
      </MainContent>
    </ElectionNavScreen>
  );
}
