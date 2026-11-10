import React, { useState } from 'react';
import { Route, useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { DateWithoutTime, throwIllegalValue } from '@votingworks/basics';
import type {
  ElectionInfo,
  StateFeaturesConfig,
} from '@votingworks/election-definition-backend';
import {
  type ElectionId,
  ElectionStringKey,
  LanguageCode,
} from '@votingworks/types';
import {
  Button,
  Callout,
  CheckboxGroup,
  DesktopPalette,
  SegmentedButton,
} from '@votingworks/ui';
import {
  type AudioPanelRoutes,
  useAudioPanelRoutes,
} from './audio_panel_routes.js';
import { InputWithAudio } from './ballot_audio/input_with_audio.js';
import { DeleteElectionButton } from './delete_election_button.js';
import { useElectionDefinitionApi } from './election_definition_context.js';
import {
  FormBody,
  FormErrorContainer,
  FormFixed,
  FormFooter,
} from './form_fixed.js';
import { FieldName, FixedViewport, InputGroup, Row } from './layout.js';
import { SealImageInput } from './seal_image_input.js';
import { SignatureImageInput } from './signature_image_input.js';

export interface ElectionInfoEditorProps {
  electionId: ElectionId;
  isLocked?: boolean;
  showSignatureInput?: boolean;
  AudioPanel?: React.ComponentType;
  onElectionDeleted: () => void;
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
  'electionId' | 'AudioPanel'
> & {
  savedElectionInfo: ElectionInfo;
  features: StateFeaturesConfig;
  audioRoutes?: AudioPanelRoutes;
};

function ElectionInfoForm({
  savedElectionInfo,
  features,
  isLocked,
  showSignatureInput,
  audioRoutes,
  onElectionDeleted,
}: ElectionInfoFormProps): JSX.Element {
  const api = useElectionDefinitionApi();
  const history = useHistory();
  const [isEditing, setIsEditing] = useState(
    // Default to editing for newly created elections
    hasBlankElectionInfo(savedElectionInfo)
  );
  const [electionInfo, setElectionInfo] = useState(savedElectionInfo);
  const [draftDate, setDraftDate] = useState<string>();
  const updateElectionInfoMutation = api.updateElectionInfo.useMutation();

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
    setIsEditing(!isEditing);
    updateElectionInfoMutation.reset();
    if (audioRoutes?.isPanelOpen) {
      history.push(audioRoutes.closeUrl);
    }
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
            audioScreenUrl={audioRoutes?.screenUrl({
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
            audioScreenUrl={audioRoutes?.screenUrl({
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
            audioScreenUrl={audioRoutes?.screenUrl({
              stringKey: ElectionStringKey.JURISDICTION_NAME,
            })}
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
        <div>
          <FieldName>Seal</FieldName>
          <div style={{ display: 'inline-flex' }}>
            <SealImageInput
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
        {showSignatureInput && (
          <React.Fragment>
            <div>
              <FieldName>Signature</FieldName>
              <SignatureImageInput
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
        <DeleteElectionButton
          electionId={savedElectionInfo.electionId}
          onDeleted={onElectionDeleted}
        />
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
  AudioPanel,
  ...formProps
}: ElectionInfoEditorProps): JSX.Element | null {
  const api = useElectionDefinitionApi();
  const getElectionInfoQuery = api.getElectionInfo.useQuery(electionId);
  const getStateFeaturesQuery = api.getStateFeatures.useQuery(electionId);
  const audioRoutes = useAudioPanelRoutes(':stringKey');

  if (!getElectionInfoQuery.isSuccess || !getStateFeaturesQuery.isSuccess) {
    return null;
  }

  return (
    <Viewport>
      <ElectionInfoForm
        {...formProps}
        savedElectionInfo={getElectionInfoQuery.data}
        features={getStateFeaturesQuery.data}
        audioRoutes={AudioPanel ? audioRoutes : undefined}
      />
      {AudioPanel && (
        <Route path={audioRoutes.panelPath}>
          <AudioPanel />
        </Route>
      )}
    </Viewport>
  );
}
