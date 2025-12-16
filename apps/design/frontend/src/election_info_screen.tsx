import React, { useState } from 'react';
import {
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
import type { ElectionInfo } from '@votingworks/design-backend';
import { Route, Switch, useHistory, useParams } from 'react-router-dom';
import { z } from 'zod/v4';
import { DateWithoutTime, throwIllegalValue } from '@votingworks/basics';
import styled from 'styled-components';
import {
  deleteElection,
  getBallotsFinalizedAt,
  getBallotTemplate,
  getStateFeatures,
  getElectionInfo,
  updateElectionInfo,
} from './api';
import { FieldName, FixedViewport, InputGroup, Row } from './layout';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, routes } from './routes';
import { SealImageInput } from './seal_image_input';
import { useTitle } from './hooks/use_title';
import { SignatureImageInput } from './signature_image_input';
import { InputWithAudio } from './ballot_audio/input_with_audio';
import {
  FormBody,
  FormErrorContainer,
  FormFixed,
  FormFooter,
} from './form_fixed';
import { ElectionInfoAudioPanel } from './election_info_audio_panel';

function hasBlankElectionInfo(electionInfo: ElectionInfo): boolean {
  return (
    !electionInfo.title &&
    !electionInfo.state &&
    !electionInfo.countyName &&
    !electionInfo.seal
  );
}

const Form = styled(FormFixed)`
  input,
  .search-select {
    max-width: 18rem;
  }
`;

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
  const getStateFeaturesQuery = getStateFeatures.useQuery(
    savedElectionInfo.electionId
  );
  const ballotTemplateIdQuery = getBallotTemplate.useQuery(
    savedElectionInfo.electionId
  );

  const { electionId } = useParams<ElectionIdParams>();
  const infoRoutes = routes.election(electionId).electionInfo;

  /* istanbul ignore next - @preserve */
  if (!getStateFeaturesQuery.isSuccess || !ballotTemplateIdQuery.isSuccess) {
    return null;
  }
  const features = getStateFeaturesQuery.data;
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

    // Make sure audio panel is closed when editing:
    history.push(infoRoutes.root.path);
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
            audioScreenUrl={infoRoutes.audio({
              stringKey: ElectionStringKey.ELECTION_TITLE,
            })}
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
            disabled={disabled}
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
          disabled={disabled}
        />
        <InputGroup label="State">
          <InputWithAudio
            audioScreenUrl={infoRoutes.audio({
              stringKey: ElectionStringKey.STATE_NAME,
            })}
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
            audioScreenUrl={infoRoutes.audio({
              stringKey: ElectionStringKey.COUNTY_NAME,
            })}
            editing={isEditing}
            type="text"
            value={electionInfo.countyName}
            onChange={onInputChange('countyName')}
            onBlur={onInputBlur('countyName')}
            disabled={disabled}
            autoComplete="off"
            required
          />
        </InputGroup>
        <div>
          <FieldName>Seal</FieldName>
          <div style={{ display: 'inline-flex' }}>
            <SealImageInput
              value={electionInfo.seal}
              onChange={(seal = '') =>
                setElectionInfo({ ...electionInfo, seal })
              }
              disabled={disabled}
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
                disabled={disabled}
                required
              />
            </div>
            <InputGroup label="Signature Caption">
              <input
                type="text"
                value={electionInfo.signatureCaption ?? ''}
                onChange={onInputChange('signatureCaption')}
                onBlur={onInputBlur('signatureCaption')}
                disabled={disabled}
                autoComplete="off"
                required
              />
            </InputGroup>
          </React.Fragment>
        )}
        {features.BALLOT_LANGUAGE_CONFIG && (
          <div style={{ width: '18rem' }}>
            <CheckboxGroup
              disabled={disabled}
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
            disabled={!!ballotsFinalizedAt}
          >
            Edit
          </Button>
        )}

        <Button
          disabled={deleteElectionMutation.isLoading}
          icon="Delete"
          fill="outlined"
          onPress={onDeletePress}
          variant="danger"
        >
          Delete Election
        </Button>
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

export function ElectionInfoScreen(): JSX.Element | null {
  const params = useParams<{ electionId: string }>();
  const { electionId } = unsafeParse(
    z.object({ electionId: ElectionIdSchema }),
    params
  );
  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  useTitle(routes.election(electionId).electionInfo.root.title);
  const infoParamRoutes = routes.election(':electionId').electionInfo;

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
      <Viewport>
        <ElectionInfoForm
          savedElectionInfo={getElectionInfoQuery.data}
          ballotsFinalizedAt={ballotsFinalizedAt}
        />
        <Switch>
          <Route path={infoParamRoutes.audio({ stringKey: ':stringKey' })}>
            <ElectionInfoAudioPanel />
          </Route>
        </Switch>
      </Viewport>
    </ElectionNavScreen>
  );
}
