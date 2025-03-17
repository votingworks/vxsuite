import React, { useState } from 'react';
import {
  ElectionIdSchema,
  LanguageCode,
  unsafeParse,
} from '@votingworks/types';
import {
  Button,
  CheckboxGroup,
  H1,
  MainContent,
  MainHeader,
  Modal,
  P,
  SegmentedButton,
} from '@votingworks/ui';
import type { ElectionInfo } from '@votingworks/design-backend';
import { useHistory, useParams } from 'react-router-dom';
import { z } from 'zod';
import { DateWithoutTime } from '@votingworks/basics';
import {
  deleteElection,
  getBallotsFinalizedAt,
  getElectionInfo,
  getUserFeatures,
  updateElectionInfo,
} from './api';
import { FieldName, Form, FormActionsRow, InputGroup } from './layout';
import { ElectionNavScreen } from './nav_screen';
import { routes } from './routes';
import { SealImageInput } from './seal_image_input';
import { useTitle } from './hooks/use_title';

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
}): JSX.Element | null {
  const [isEditing, setIsEditing] = useState(
    // Default to editing for newly created elections
    hasBlankElectionInfo(savedElectionInfo)
  );
  const [electionInfo, setElectionInfo] = useState(savedElectionInfo);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [draftDate, setDraftDate] = useState<string>();
  const updateElectionInfoMutation = updateElectionInfo.useMutation();
  const deleteElectionMutation = deleteElection.useMutation();
  const history = useHistory();
  const getUserFeaturesQuery = getUserFeatures.useQuery();

  /* istanbul ignore next - @preserve */
  if (!getUserFeaturesQuery.isSuccess) {
    return null;
  }
  const features = getUserFeaturesQuery.data;

  function onSubmit() {
    updateElectionInfoMutation.mutate(electionInfo, {
      onSuccess: () => {
        setIsEditing(false);
      },
    });
  }

  function onReset() {
    setElectionInfo(savedElectionInfo);
    setIsEditing((prev) => !prev);
  }

  type TextProperties = Exclude<keyof ElectionInfo, 'date' | 'electionId'>;

  function onInputChange(field: TextProperties) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setElectionInfo((prev = savedElectionInfo) => ({
        ...prev,
        [field]: e.target.value,
      }));
    };
  }

  function onInputBlur(field: TextProperties) {
    return () => {
      setElectionInfo((prev = savedElectionInfo) => ({
        ...prev,
        [field]:
          typeof prev[field] === 'string' ? prev[field]?.trim() : prev[field],
      }));
    };
  }

  function onDeletePress() {
    setIsConfirmingDelete(true);
  }

  function onCancelDelete() {
    setIsConfirmingDelete(false);
  }

  function onConfirmDeletePress() {
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
          value={draftDate ?? electionInfo.date.toISOString()}
          onChange={(e) => {
            try {
              const newDate = new DateWithoutTime(e.target.value);
              setElectionInfo({
                ...electionInfo,
                date: newDate,
              });
              setDraftDate(undefined);
            } catch {
              setDraftDate(e.target.value);
            }
          }}
          disabled={!isEditing}
          required
        />
      </InputGroup>
      <SegmentedButton
        label="Type"
        options={[
          { label: 'General', id: 'general' },
          { label: 'Primary', id: 'primary' },
        ]}
        selectedOptionId={electionInfo.type}
        onChange={(type) => setElectionInfo({ ...electionInfo, type })}
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
        <div style={{ display: 'inline-flex' }}>
          <SealImageInput
            value={electionInfo.seal}
            onChange={(seal = '') => setElectionInfo({ ...electionInfo, seal })}
            disabled={!isEditing}
            required
          />
        </div>
      </div>
      {features.BALLOT_LANGUAGE_CONFIG && (
        <div style={{ width: '18rem' }}>
          <CheckboxGroup
            disabled={!isEditing}
            label="Ballot Languages"
            value={electionInfo.languageCodes}
            onChange={(value) => {
              const languageCodes = value.map((v) => v as LanguageCode);
              setElectionInfo({ ...electionInfo, languageCodes });
            }}
            options={[
              { label: 'English', value: LanguageCode.ENGLISH },
              { label: 'Spanish', value: LanguageCode.SPANISH },
              {
                label: 'Chinese (Simplified)',
                value: LanguageCode.CHINESE_SIMPLIFIED,
              },
              {
                label: 'Chinese (Traditional)',
                value: LanguageCode.CHINESE_TRADITIONAL,
              },
            ]}
          />
        </div>
      )}

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
        <React.Fragment>
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
            {features.DELETE_ELECTION && (
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
            )}
          </div>
          {electionInfo.electionId && isConfirmingDelete && (
            <Modal
              title="Delete Election"
              onOverlayClick={onCancelDelete}
              content={
                <div>
                  <P>
                    Are you sure you want to delete this election? This action
                    cannot be undone.
                  </P>
                </div>
              }
              actions={
                <React.Fragment>
                  <Button
                    onPress={() => onConfirmDeletePress()}
                    variant="danger"
                    autoFocus
                  >
                    Delete
                  </Button>
                  <Button onPress={onCancelDelete}>Cancel</Button>
                </React.Fragment>
              }
            />
          )}
        </React.Fragment>
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
  useTitle(routes.election(electionId).electionInfo.title);

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
