import React, { useState } from 'react';
import {
  ElectionIdSchema,
  LanguageCode,
  unsafeParse,
} from '@votingworks/types';
import {
  Button,
  Callout,
  CheckboxGroup,
  H1,
  MainContent,
  Modal,
  P,
  SegmentedButton,
} from '@votingworks/ui';
import type { ElectionInfo } from '@votingworks/design-backend';
import { useHistory, useParams } from 'react-router-dom';
import { z } from 'zod/v4';
import { DateWithoutTime, throwIllegalValue } from '@votingworks/basics';
import {
  deleteElection,
  getBallotsFinalizedAt,
  getBallotTemplate,
  getElectionInfo,
  getUserFeatures,
  updateElectionInfo,
} from './api';
import { FieldName, Form, FormActionsRow, InputGroup } from './layout';
import { ElectionNavScreen, Header } from './nav_screen';
import { routes } from './routes';
import { SealImageInput } from './seal_image_input';
import { useTitle } from './hooks/use_title';
import { SignatureImageInput } from './signature_image_input';

function hasBlankElectionInfo(electionInfo: ElectionInfo): boolean {
  return !electionInfo.title;
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
  const ballotTemplateIdQuery = getBallotTemplate.useQuery(
    savedElectionInfo.electionId
  );

  /* istanbul ignore next - @preserve */
  if (!getUserFeaturesQuery.isSuccess || !ballotTemplateIdQuery.isSuccess) {
    return null;
  }
  const features = getUserFeaturesQuery.data;
  const ballotTemplateId = ballotTemplateIdQuery.data;
  const showSignatureInput = ballotTemplateId === 'NhBallot';

  function onSubmit() {
    updateElectionInfoMutation.mutate(electionInfo, {
      onSuccess: (result) => {
        if (result.isOk()) {
          setIsEditing(false);
        }
      },
    });
  }

  function onReset() {
    setElectionInfo(savedElectionInfo);
    setIsEditing((prev) => !prev);
    updateElectionInfoMutation.reset();
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

  let errorMessage;
  if (updateElectionInfoMutation.data?.isErr()) {
    const error = updateElectionInfoMutation.data.err();
    /* istanbul ignore next - @preserve */
    if (error !== 'duplicate-title-and-date') throwIllegalValue(error);
    errorMessage = (
      <Callout icon="Danger" color="danger">
        There is already an election with the same title and date.
      </Callout>
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
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
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
      {showSignatureInput && (
        <React.Fragment>
          <div>
            <FieldName>Signature</FieldName>
            <SignatureImageInput
              value={electionInfo.signatureImage ?? ''}
              onChange={(signatureImage = '') =>
                setElectionInfo({
                  ...electionInfo,
                  signatureImage,
                })
              }
              disabled={!isEditing}
              required
            />
          </div>
          <InputGroup label="Signature Caption">
            <input
              type="text"
              value={electionInfo.signatureCaption ?? ''}
              onChange={onInputChange('signatureCaption')}
              onBlur={onInputBlur('signatureCaption')}
              disabled={!isEditing}
              autoComplete="off"
              required
            />
          </InputGroup>
        </React.Fragment>
      )}
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

      {errorMessage}

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
      <Header>
        <H1>Election Info</H1>
      </Header>
      <MainContent>
        <ElectionInfoForm
          savedElectionInfo={getElectionInfoQuery.data}
          ballotsFinalizedAt={ballotsFinalizedAt}
        />
      </MainContent>
    </ElectionNavScreen>
  );
}
