import React, { useState } from 'react';
import { Route, Switch, useHistory, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { z } from 'zod/v4';
import { DateWithoutTime, throwIllegalValue } from '@votingworks/basics';
import type {
  ElectionInfo,
  StateFeaturesConfig,
} from '@votingworks/hub-backend';
import {
  type ElectionId,
  ElectionIdSchema,
  ElectionStringKey,
  LanguageCode,
  unsafeParse,
} from '@votingworks/types';
import {
  Button,
  Callout,
  CheckboxGroup,
  DesktopPalette,
  H1,
  Modal,
  P,
  SegmentedButton,
} from '@votingworks/ui';
import {
  FieldName,
  FixedViewport,
  FormBody,
  FormErrorContainer,
  FormFooter,
  InputGroup,
  InputWithAudio,
  Row,
} from '@votingworks/election-definition-ui';
import {
  deleteElection,
  getBallotsFinalizedAt,
  getBallotTemplate,
  getElectionInfo,
  getStateFeatures,
  updateElectionInfo,
} from './api.js';
import { FormFixed } from './form_fixed.js';
import { ElectionNavScreen, Header } from './nav_screen.js';
import { routes } from './routes.js';
import { SealImageInput } from './seal_image_input.js';
import { useTitle } from './hooks/use_title.js';
import { SignatureImageInput } from './signature_image_input.js';
import { ElectionInfoAudioPanel } from './election_info_audio_panel.js';

export interface ElectionImageInputProps {
  value?: string;
  onChange: (value?: string) => void;
  disabled?: boolean;
  required?: boolean;
}

export interface ElectionInfoAudioRoutes {
  audioScreenUrl: (stringKey: ElectionStringKey) => string;
}

export interface ElectionInfoEditorProps {
  electionId: ElectionId;
  isLocked?: boolean;
  SealInput?: (props: ElectionImageInputProps) => JSX.Element;
  SignatureInput?: (props: ElectionImageInputProps) => JSX.Element;
  audioRoutes?: ElectionInfoAudioRoutes;
  onEditingChange?: (isEditing: boolean) => void;
  footerActions?: React.ReactNode;
  children?: React.ReactNode;
}

function hasBlankElectionInfo(electionInfo: ElectionInfo): boolean {
  return !electionInfo.title && !electionInfo.seal;
}

const Form = styled(FormFixed)`
  input,
  .search-select {
    max-width: 18rem;
  }
`;

type ElectionInfoFormProps = Omit<
  ElectionInfoEditorProps,
  'electionId' | 'children'
> & {
  savedElectionInfo: ElectionInfo;
  features: StateFeaturesConfig;
};

function ElectionInfoForm({
  savedElectionInfo,
  features,
  isLocked,
  SealInput,
  SignatureInput,
  audioRoutes,
  onEditingChange,
  footerActions,
}: ElectionInfoFormProps): JSX.Element {
  const [isEditing, setIsEditing] = useState(
    // Default to editing for newly created elections
    hasBlankElectionInfo(savedElectionInfo)
  );
  const [electionInfo, setElectionInfo] = useState(savedElectionInfo);
  const [draftDate, setDraftDate] = useState<string>();
  const updateElectionInfoMutation = updateElectionInfo.useMutation();

  function onSubmit() {
    updateElectionInfoMutation.mutate(electionInfo, {
      onSuccess: (result) => {
        if (result.isOk()) {
          setIsEditing(false);
          onEditingChange?.(false);
        }
      },
    });
  }

  function onReset() {
    setElectionInfo(savedElectionInfo);
    setIsEditing(!isEditing);
    updateElectionInfoMutation.reset();
    onEditingChange?.(!isEditing);
  }

  type TextProperties = Exclude<keyof ElectionInfo, 'date' | 'electionId'>;

  function onInputChange(field: TextProperties) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      // @coverage-defer
      setElectionInfo((prev = savedElectionInfo) => ({
        ...prev,
        [field]: e.target.value,
      }));
    };
  }

  function onInputBlur(field: TextProperties) {
    return () => {
      // @coverage-defer
      setElectionInfo((prev = savedElectionInfo) => ({
        ...prev,
        [field]:
          typeof prev[field] === 'string' ? prev[field]?.trim() : prev[field],
      }));
    };
  }

  let errorMessage;
  if (updateElectionInfoMutation.data?.isErr()) {
    const error = updateElectionInfoMutation.data.err();
    // @coverage-exclude
    if (error !== 'duplicate-title-and-date') throwIllegalValue(error);
    errorMessage = (
      <Callout icon="Danger" color="danger">
        There is already an election with the same title and date.
      </Callout>
    );
  }

  // Elections with an external source cannot have certain fields edited
  const hasExternalSource = Boolean(savedElectionInfo.externalSource);
  const disabled = updateElectionInfoMutation.isLoading || !isEditing;

  return (
    <Form
      editing={isEditing}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onReset={(e) => {
        e.preventDefault();
        onReset();
      }}
    >
      <FormBody>
        <InputGroup label="Title">
          <InputWithAudio
            audioScreenUrl={audioRoutes?.audioScreenUrl(
              ElectionStringKey.ELECTION_TITLE
            )}
            editing={isEditing}
            tooltipPlacement="bottom"
            type="text"
            value={electionInfo.title}
            onChange={onInputChange('title')}
            onBlur={onInputBlur('title')}
            disabled={disabled}
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
            disabled={disabled || hasExternalSource}
            required
          />
        </InputGroup>
        <SegmentedButton
          label="Type"
          options={[
            { label: 'General', id: 'general' as const },
            ...(features.COMBINED_BALLOT_PRIMARIES
              ? [
                  {
                    label: 'Closed Primary',
                    id: 'closed-primary' as const,
                  },
                  { label: 'Open Primary', id: 'open-primary' as const },
                ]
              : [{ label: 'Primary', id: 'closed-primary' as const }]),
          ]}
          selectedOptionId={
            electionInfo.type === 'general'
              ? 'general'
              : electionInfo.isMiCombinedBallotPrimary
                ? 'open-primary'
                : 'closed-primary'
          }
          onChange={(option) =>
            setElectionInfo({
              ...electionInfo,
              // @coverage-defer
              type: option === 'general' ? 'general' : 'primary',
              isMiCombinedBallotPrimary: option === 'open-primary',
            })
          }
          disabled={disabled || hasExternalSource}
        />
        <InputGroup label="State">
          <InputWithAudio
            audioScreenUrl={audioRoutes?.audioScreenUrl(
              ElectionStringKey.STATE_NAME
            )}
            editing={isEditing}
            type="text"
            value={electionInfo.state}
            onChange={onInputChange('state')}
            onBlur={onInputBlur('state')}
            disabled={disabled}
            autoComplete="off"
            required
          />
        </InputGroup>
        <InputGroup label="Jurisdiction">
          <InputWithAudio
            audioScreenUrl={audioRoutes?.audioScreenUrl(
              ElectionStringKey.JURISDICTION_NAME
            )}
            editing={isEditing}
            type="text"
            value={electionInfo.jurisdictionName}
            onChange={onInputChange('jurisdictionName')}
            onBlur={onInputBlur('jurisdictionName')}
            disabled={disabled}
            autoComplete="off"
            required
          />
        </InputGroup>
        {SealInput && (
          <div>
            <FieldName>Seal</FieldName>
            <div style={{ display: 'inline-flex' }}>
              <SealInput
                value={electionInfo.seal}
                // @coverage-defer
                onChange={(seal = '') =>
                  setElectionInfo({ ...electionInfo, seal })
                }
                disabled={disabled || hasExternalSource}
                required
              />
            </div>
          </div>
        )}
        {SignatureInput && (
          <React.Fragment>
            <div>
              <FieldName>Signature</FieldName>
              <SignatureInput
                value={electionInfo.signatureImage ?? ''}
                // @coverage-defer
                onChange={(signatureImage = '') =>
                  setElectionInfo({
                    ...electionInfo,
                    signatureImage,
                  })
                }
                disabled={disabled || hasExternalSource}
                required
              />
            </div>
            <InputGroup label="Signature Caption">
              <input
                type="text"
                value={electionInfo.signatureCaption ?? ''}
                onChange={onInputChange('signatureCaption')}
                onBlur={onInputBlur('signatureCaption')}
                disabled={disabled || hasExternalSource}
                autoComplete="off"
                required
              />
            </InputGroup>
          </React.Fragment>
        )}
        {features.BALLOT_LANGUAGE_CONFIG && (
          <div style={{ width: '18rem' }}>
            <CheckboxGroup
              disabled={disabled || hasExternalSource}
              label="Ballot Languages"
              value={electionInfo.languageCodes}
              onChange={(languageCodes) => {
                setElectionInfo({ ...electionInfo, languageCodes });
              }}
              options={[
                { label: 'English', value: LanguageCode.ENGLISH },
                { label: 'Arabic', value: LanguageCode.ARABIC },
                { label: 'Bengali', value: LanguageCode.BENGALI },
                {
                  label: 'Chinese (Simplified)',
                  value: LanguageCode.CHINESE_SIMPLIFIED,
                },
                {
                  label: 'Chinese (Traditional)',
                  value: LanguageCode.CHINESE_TRADITIONAL,
                },
                { label: 'Spanish', value: LanguageCode.SPANISH },
              ]}
            />
          </div>
        )}
      </FormBody>

      <FormErrorContainer>{errorMessage}</FormErrorContainer>

      <FormFooter style={{ justifyContent: 'space-between' }}>
        {isEditing ? (
          <Row style={{ flexWrap: 'wrap-reverse', gap: '0.5rem' }}>
            <Button type="reset">Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              icon="Done"
              disabled={updateElectionInfoMutation.isLoading}
            >
              Save
            </Button>
          </Row>
        ) : (
          <Button
            type="reset"
            variant="primary"
            icon="Edit"
            disabled={isLocked}
          >
            Edit
          </Button>
        )}
        {footerActions}
      </FormFooter>
    </Form>
  );
}

const Viewport = styled(FixedViewport)`
  flex-direction: row;

  > ${Form} {
    width: 100%;

    :not(:only-child) {
      border-right: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
        ${DesktopPalette.Gray30};
      min-width: 15rem;
      max-width: min(45%, 30rem);

      /* Add separation between the border and potential scrollbar */
      padding-right: 0.25rem;
    }
  }

  /* Audio Panel */
  > :last-child:not(:only-child) {
    flex-grow: 1;
  }
`;

export function ElectionInfoEditor({
  electionId,
  children,
  ...formProps
}: ElectionInfoEditorProps): JSX.Element | null {
  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);
  const getStateFeaturesQuery = getStateFeatures.useQuery(electionId);

  if (!getElectionInfoQuery.isSuccess || !getStateFeaturesQuery.isSuccess) {
    return null;
  }

  return (
    <Viewport>
      <ElectionInfoForm
        {...formProps}
        savedElectionInfo={getElectionInfoQuery.data}
        features={getStateFeaturesQuery.data}
      />
      {children}
    </Viewport>
  );
}

function DeleteElectionButton({
  electionId,
}: {
  electionId: ElectionId;
}): JSX.Element {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const deleteElectionMutation = deleteElection.useMutation();
  const history = useHistory();

  function onDeletePress() {
    setIsConfirmingDelete(true);
  }

  // @coverage-defer
  function onCancelDelete() {
    setIsConfirmingDelete(false);
  }

  function onConfirmDeletePress() {
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
    <React.Fragment>
      <Button
        disabled={deleteElectionMutation.isLoading}
        icon="Delete"
        fill="outlined"
        onPress={onDeletePress}
        variant="danger"
      >
        Delete Election
      </Button>
      {isConfirmingDelete && (
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
  );
}

export function ElectionInfoScreen(): JSX.Element | null {
  const params = useParams<{ electionId: string }>();
  const { electionId } = unsafeParse(
    z.object({ electionId: ElectionIdSchema }),
    params
  );
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const ballotTemplateIdQuery = getBallotTemplate.useQuery(electionId);
  const history = useHistory();
  useTitle(routes.election(electionId).electionInfo.root.title);
  const infoRoutes = routes.election(electionId).electionInfo;
  const infoParamRoutes = routes.election(':electionId').electionInfo;

  if (
    !getBallotsFinalizedAtQuery.isSuccess ||
    !ballotTemplateIdQuery.isSuccess
  ) {
    return null;
  }
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const ballotTemplateId = ballotTemplateIdQuery.data;
  const showSignatureInput =
    ballotTemplateId === 'NhBallot' || ballotTemplateId === 'NhStateBallot';

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>Election Info</H1>
      </Header>
      <ElectionInfoEditor
        electionId={electionId}
        isLocked={!!ballotsFinalizedAt}
        SealInput={SealImageInput}
        SignatureInput={showSignatureInput ? SignatureImageInput : undefined}
        audioRoutes={{
          audioScreenUrl: (stringKey) => infoRoutes.audio({ stringKey }),
        }}
        onEditingChange={() => history.push(infoRoutes.root.path)}
        footerActions={<DeleteElectionButton electionId={electionId} />}
      >
        <Switch>
          <Route path={infoParamRoutes.audio({ stringKey: ':stringKey' })}>
            <ElectionInfoAudioPanel />
          </Route>
        </Switch>
      </ElectionInfoEditor>
    </ElectionNavScreen>
  );
}
