import React, { useState } from 'react';
import styled, { css } from 'styled-components';
import type { z } from 'zod/v4';

import {
  assert,
  find,
  type Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  type ElectionId,
  type Contest,
  type DistrictId,
  type PartyId,
  type Candidate,
  CandidateContestSchema,
  type CandidateId,
  type ContestId,
  safeParse,
  YesNoContestSchema,
  ElectionStringKey,
  type StraightPartyContest,
} from '@votingworks/types';
import {
  Callout,
  SearchSelect,
  SegmentedButton,
  P,
  TH,
  TD,
  Button,
  Modal,
  DesktopPalette,
  Table,
} from '@votingworks/ui';

import { generateId } from '@votingworks/election-definition-backend';

import { AudioLinkButton } from './ballot_audio/audio_link_button.js';
import { InputWithAudio } from './ballot_audio/input_with_audio.js';
import { RichTextEditorWithAudio } from './ballot_audio/rich_text_editor_with_audio.js';
import { useElectionDefinitionApi } from './election_definition_context.js';
import {
  cssFormViewMode,
  FormBody,
  FormErrorContainer,
  FormFixed,
  FormFooter,
  FormTitle,
} from './form_fixed.js';
import { Column, FieldName, InputGroup, Row } from './layout.js';
import type { ListDetailAudioParams } from './list_detail_routes.js';
import { Tooltip, TooltipContainer } from './tooltip.js';
import { StyledRichTextEditor } from './rich_text_editor.js';
import { replaceAtIndex } from './utils.js';

const Form = styled(FormFixed)`
  .search-select,
  input[type='text'] {
    max-width: 20rem;
    min-width: 5rem;
    width: 100%;
  }

  .icon-button {
    background: ${(p) => p.theme.colors.background};
    border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
    padding: 0.6rem 0.75rem;
  }

  ${(p) =>
    !p.editing &&
    css`
      ${StyledRichTextEditor} {
        ${cssFormViewMode}
      }
    `}
`;

const InputRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
`;

const CandidateInputTable = styled(Table)`
  max-width: 50rem;

  td,
  th {
    border: 0;
    padding: 0.35rem;

    :first-child {
      padding-left: 0;
    }

    :last-child {
      padding-right: 0;

      /* Make the last cell shrink to fit the action button: */
      width: 1px;
    }
  }

  th {
    font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
    padding-top: 0;
  }

  tr {
    :focus-within,
    :hover {
      td {
        background: ${DesktopPalette.Purple10};
      }
    }
  }
`;

export interface ContestFormProps {
  audioUrl?: (params: ListDetailAudioParams) => string;
  editing: boolean;
  electionId: ElectionId;
  exit: () => void;
  isLocked?: boolean;
  savedContest?: Contest;
  switchToEdit: (contestId: ContestId) => void;
  switchToView: (contestId: ContestId) => void;
  title: React.ReactNode;
}

export function ContestForm(props: ContestFormProps): React.ReactNode {
  const {
    audioUrl,
    editing,
    electionId,
    exit,
    isLocked,
    savedContest,
    switchToEdit,
    switchToView,
    title,
  } = props;
  const [contest, setContest] = useState<DraftContest>(
    savedContest
      ? draftContestFromContest(savedContest)
      : // To make mocked IDs predictable in tests, we pass a function here
        // so it will only be called on initial render.
        createBlankCandidateContest
  );
  const api = useElectionDefinitionApi();
  const getElectionInfoQuery = api.getElectionInfo.useQuery(electionId);
  const listDistrictsQuery = api.listDistricts.useQuery(electionId);
  const listPartiesQuery = api.listParties.useQuery(electionId);
  const getStateFeaturesQuery = api.getStateFeatures.useQuery(electionId);
  const createContestMutation = api.createContest.useMutation();
  const updateContestMutation = api.updateContest.useMutation();
  const deleteContestMutation = api.deleteContest.useMutation();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [validationErrorMessage, setValidationErrorMessage] = useState<
    string | null
  >(null);

  if (
    !getElectionInfoQuery.isSuccess ||
    !listDistrictsQuery.isSuccess ||
    !listPartiesQuery.isSuccess ||
    !getStateFeaturesQuery.isSuccess
  ) {
    return null;
  }
  const electionInfo = getElectionInfoQuery.data;
  const districts = listDistrictsQuery.data;
  const parties = listPartiesQuery.data;
  const hasExternalSource = Boolean(electionInfo.externalSource);
  const features = getStateFeaturesQuery.data;

  function setEditing(shouldEdit: boolean) {
    // @coverage-defer
    if (!savedContest) return exit();

    if (shouldEdit) {
      switchToEdit(savedContest.id);
    } else {
      switchToView(savedContest.id);
    }
  }

  function onSubmit() {
    const formContestResult = tryContestFromDraftContest(contest);
    if (formContestResult.isErr()) {
      setValidationErrorMessage(
        formContestResult
          .err()
          .issues.map((i) => i.message)
          .join(', ')
      );
      return;
    }

    setValidationErrorMessage(null);

    const formContest = formContestResult.ok();
    if (savedContest) {
      updateContestMutation.mutate(
        { electionId, updatedContest: formContest },
        {
          onSuccess: (result) => {
            if (result.isOk()) setEditing(false);
          },
        }
      );
    } else {
      createContestMutation.mutate(
        { electionId, newContest: formContest },
        {
          onSuccess: (result) => {
            // @coverage-defer
            if (result.isOk()) {
              switchToView(formContest.id);
            }
          },
        }
      );
    }
  }

  function onDelete() {
    deleteContestMutation.mutate(
      { electionId, contestId: contest.id },
      { onSuccess: exit }
    );
  }

  function onNameChange(
    contestToUpdate: DraftCandidateContest,
    candidate: DraftCandidate,
    index: number,
    nameParts: {
      first?: string;
      middle?: string;
      last?: string;
    }
  ) {
    const {
      // @coverage-defer
      first = candidate.firstName,
      middle = candidate.middleName,
      last = candidate.lastName,
    } = nameParts;
    setContest({
      ...contestToUpdate,
      candidates: replaceAtIndex(contestToUpdate.candidates, index, {
        ...candidate,
        firstName: first,
        middleName: middle,
        lastName: last,
      }),
    });
  }

  const someMutationIsLoading =
    createContestMutation.isLoading ||
    updateContestMutation.isLoading ||
    deleteContestMutation.isLoading;

  const error =
    createContestMutation.data?.err() || updateContestMutation.data?.err();
  const errorMessage = validationErrorMessage ? (
    <Callout icon="Danger" color="danger">
      {validationErrorMessage}
    </Callout>
  ) : error ? (
    (() => {
      switch (error) {
        case 'duplicate-contest':
          return (
            <Callout icon="Danger" color="danger">
              {contest.type === 'candidate' ? (
                <React.Fragment>
                  There is already a contest with the same district, title,
                  seats, and term.
                </React.Fragment>
              ) : (
                <React.Fragment>
                  There is already a contest with the same district and title.
                </React.Fragment>
              )}
            </Callout>
          );
        case 'duplicate-candidate':
          return (
            <Callout icon="Danger" color="danger">
              Candidates must have different names.
            </Callout>
          );
        case 'duplicate-option':
          return (
            <Callout icon="Danger" color="danger">
              Options must have different labels.
            </Callout>
          );
        default: {
          throwIllegalValue(error);
        }
      }
    })()
  ) : null;

  const disabled = !editing || someMutationIsLoading;

  return (
    <Form
      editing={editing}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onReset={(e) => {
        e.preventDefault();
        setContest(
          // @coverage-defer
          savedContest
            ? draftContestFromContest(savedContest)
            : createBlankCandidateContest
        );
        setEditing(!editing);
      }}
    >
      <FormBody>
        <FormTitle>{title}</FormTitle>

        {contest.type === 'straight-party' && (
          <Callout icon="Info" color="neutral">
            This contest is generated based on the election parties and cannot
            be edited directly. To edit the party options, edit the party list.
          </Callout>
        )}

        <InputGroup label="Title">
          <InputWithAudio
            audioScreenUrl={audioUrl?.({
              id: contest.id,
              stringKey: ElectionStringKey.CONTEST_TITLE,
              subkey: contest.id,
            })}
            disabled={disabled}
            editing={editing}
            type="text"
            value={contest.title}
            onChange={(e) => setContest({ ...contest, title: e.target.value })}
            onBlur={(e) =>
              setContest({ ...contest, title: e.target.value.trim() })
            }
            autoComplete="off"
            required
          />
        </InputGroup>
        <InputGroup label="District">
          <SearchSelect
            aria-label="District"
            menuPortalTarget={document.body}
            disabled={disabled || hasExternalSource}
            value={contest.districtId || undefined}
            onChange={(value) => {
              // @coverage-defer
              setContest({ ...contest, districtId: value || undefined });
            }}
            options={[
              { value: '', label: '' },
              ...districts.map((district) => ({
                value: district.id,
                label: district.name,
              })),
            ]}
            required
          />
        </InputGroup>

        {contest.type !== 'straight-party' && (
          <InputRow>
            <SegmentedButton
              disabled={disabled || hasExternalSource}
              label="Type"
              options={
                hasExternalSource
                  ? [
                      { id: 'candidate', label: 'Candidate Contest' },
                      { id: 'yesno', label: 'Ballot Measure' },
                    ].filter((o) => o.id === contest.type)
                  : [
                      { id: 'candidate', label: 'Candidate Contest' },
                      { id: 'yesno', label: 'Ballot Measure' },
                    ]
              }
              selectedOptionId={contest.type}
              onChange={(type) =>
                setContest({
                  // @coverage-defer
                  ...(type === 'candidate'
                    ? createBlankCandidateContest()
                    : createBlankYesNoContest()),
                  id: contest.id,
                  title: contest.title,
                  districtId: contest.districtId,
                })
              }
            />
            {contest.type === 'candidate' && (
              <SegmentedButton
                disabled={disabled}
                label="Write-Ins Allowed?"
                options={[
                  { id: 'yes', label: 'Yes' },
                  { id: 'no', label: 'No' },
                ]}
                selectedOptionId={contest.allowWriteIns ? 'yes' : 'no'}
                onChange={(value) =>
                  setContest({ ...contest, allowWriteIns: value === 'yes' })
                }
              />
            )}
          </InputRow>
        )}

        {contest.type === 'candidate' && (
          <React.Fragment>
            {electionInfo.type === 'primary' && (
              <InputGroup label="Party">
                <SearchSelect
                  aria-label="Party"
                  menuPortalTarget={document.body}
                  disabled={disabled || hasExternalSource}
                  options={[
                    { value: '', label: 'No Party Affiliation' },
                    ...parties.map((party) => ({
                      value: party.id,
                      label: party.name,
                    })),
                  ]}
                  value={contest.partyId}
                  onChange={(value) =>
                    setContest({
                      ...contest,
                      // @coverage-defer
                      partyId: value || undefined,
                    })
                  }
                />
              </InputGroup>
            )}
            <InputRow>
              <InputGroup label="Seats">
                <input
                  disabled={disabled}
                  type="number"
                  // If user clears input, valueAsNumber will be NaN, so we convert
                  // back to empty string to avoid NaN warning
                  value={Number.isNaN(contest.seats) ? '' : contest.seats}
                  onChange={(e) =>
                    setContest({ ...contest, seats: e.target.valueAsNumber })
                  }
                  min={1}
                  max={50}
                  step={1}
                  style={{ width: '4rem' }}
                  maxLength={2}
                />
              </InputGroup>
              <InputGroup label="Term">
                <InputWithAudio
                  audioScreenUrl={audioUrl?.({
                    id: contest.id,
                    stringKey: ElectionStringKey.CONTEST_TERM,
                    subkey: contest.id,
                  })}
                  disabled={disabled}
                  editing={editing}
                  type="text"
                  value={contest.termDescription ?? ''}
                  onChange={(e) =>
                    setContest({
                      ...contest,
                      termDescription: e.target.value,
                    })
                  }
                  onBlur={(e) =>
                    setContest({
                      ...contest,
                      // @coverage-defer
                      termDescription: e.target.value.trim() || undefined,
                    })
                  }
                  autoComplete="off"
                />
              </InputGroup>
            </InputRow>
            <div>
              <P weight="bold">Candidates</P>
              {contest.candidates.length === 0 && (
                <P style={{ marginTop: '0.5rem' }}>
                  You haven&apos;t added any candidates to this contest yet.
                </P>
              )}
              {contest.candidates.length > 0 && (
                <CandidateInputTable>
                  <thead>
                    <tr>
                      <TH>First Name</TH>
                      <TH>Middle Name</TH>
                      <TH>Last Name</TH>
                      <TH>Party</TH>
                      {features.CANDIDATE_DESIGNATIONS && <TH>Designation</TH>}
                      <TH />
                    </tr>
                  </thead>
                  <tbody>
                    {contest.candidates.map((candidate, index) => (
                      <tr key={candidate.id}>
                        <TD>
                          <input
                            aria-label={`Candidate ${index + 1} First Name`}
                            disabled={disabled || hasExternalSource}
                            type="text"
                            value={candidate.firstName}
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus={
                              index === contest.candidates.length - 1 &&
                              candidate.firstName === ''
                            }
                            onChange={(e) =>
                              onNameChange(contest, candidate, index, {
                                first: e.target.value,
                              })
                            }
                            onBlur={(e) =>
                              onNameChange(contest, candidate, index, {
                                // @coverage-defer
                                first: e.target.value.trim() || undefined,
                                middle: candidate.middleName,
                                last: candidate.lastName,
                              })
                            }
                            autoComplete="off"
                            required
                          />
                        </TD>
                        <TD>
                          <input
                            aria-label={`Candidate ${index + 1} Middle Name`}
                            disabled={disabled || hasExternalSource}
                            type="text"
                            value={candidate.middleName || ''}
                            onChange={(e) =>
                              onNameChange(contest, candidate, index, {
                                first: candidate.firstName,
                                middle: e.target.value,
                                last: candidate.lastName,
                              })
                            }
                            onBlur={(e) =>
                              onNameChange(contest, candidate, index, {
                                first: candidate.firstName,
                                // @coverage-defer
                                middle: e.target.value.trim() || undefined,
                                last: candidate.lastName,
                              })
                            }
                            autoComplete="off"
                          />
                        </TD>
                        <TD>
                          <input
                            aria-label={`Candidate ${index + 1} Last Name`}
                            disabled={disabled || hasExternalSource}
                            type="text"
                            value={candidate.lastName || ''}
                            onChange={(e) =>
                              onNameChange(contest, candidate, index, {
                                first: candidate.firstName,
                                middle: candidate.middleName,
                                last: e.target.value,
                              })
                            }
                            onBlur={(e) =>
                              onNameChange(contest, candidate, index, {
                                first: candidate.firstName,
                                middle: candidate.middleName,
                                // @coverage-defer
                                last: e.target.value.trim() || undefined,
                              })
                            }
                            autoComplete="off"
                            required
                          />
                        </TD>
                        <TD>
                          <SearchSelect
                            aria-label={`Candidate ${index + 1} Party`}
                            menuPortalTarget={document.body}
                            disabled={disabled || hasExternalSource}
                            options={[
                              {
                                value: '',
                                label: 'No Party Affiliation',
                              },
                              ...parties.map((party) => ({
                                value: party.id,
                                label: party.name,
                              })),
                            ]}
                            // Only support one party per candidate for now
                            value={candidate.partyIds?.[0]}
                            onChange={(value) =>
                              setContest({
                                ...contest,
                                candidates: replaceAtIndex(
                                  contest.candidates,
                                  index,
                                  {
                                    ...candidate,
                                    partyIds: value ? [value] : undefined,
                                  }
                                ),
                              })
                            }
                          />
                        </TD>
                        {features.CANDIDATE_DESIGNATIONS && (
                          <TD>
                            <input
                              aria-label={`Candidate ${index + 1} Designation`}
                              disabled={disabled || hasExternalSource}
                              type="text"
                              value={candidate.designation || ''}
                              onChange={(e) => {
                                const { value } = e.target;
                                setContest({
                                  ...contest,
                                  candidates: replaceAtIndex(
                                    contest.candidates,
                                    index,
                                    {
                                      ...candidate,
                                      designation: value || undefined,
                                    }
                                  ),
                                });
                              }}
                              onBlur={(e) => {
                                const { value } = e.target;
                                setContest({
                                  ...contest,
                                  candidates: replaceAtIndex(
                                    contest.candidates,
                                    index,
                                    {
                                      ...candidate,
                                      designation: value || undefined,
                                    }
                                  ),
                                });
                              }}
                              autoComplete="off"
                            />
                          </TD>
                        )}
                        <TD>
                          {editing && !hasExternalSource ? (
                            <TooltipContainer style={{ width: 'min-content' }}>
                              <Button
                                aria-label={`Remove Candidate ${joinCandidateName(
                                  candidate
                                )}`}
                                className="icon-button"
                                disabled={disabled}
                                icon="Trash"
                                variant="danger"
                                fill="transparent"
                                onPress={() =>
                                  setContest({
                                    ...contest,
                                    candidates: contest.candidates.filter(
                                      (_, i) => i !== index
                                    ),
                                  })
                                }
                              />
                              <Tooltip alignTo="right" bold>
                                Remove Candidate
                                <br />
                                {joinCandidateName(candidate)}
                              </Tooltip>
                            </TooltipContainer>
                          ) : (
                            audioUrl && (
                              <AudioLinkButton
                                aria-label={`Preview or Edit Audio: ${joinCandidateName(
                                  candidate
                                )}`}
                                buttonClassName="icon-button"
                                to={audioUrl({
                                  id: contest.id,
                                  stringKey: ElectionStringKey.CANDIDATE_NAME,
                                  subkey: candidate.id,
                                })}
                                tooltip={
                                  <React.Fragment>
                                    Preview/Edit Audio
                                    <br />
                                    {joinCandidateName(candidate)}
                                  </React.Fragment>
                                }
                              />
                            )
                          )}
                        </TD>
                      </tr>
                    ))}
                  </tbody>
                </CandidateInputTable>
              )}

              {editing && !hasExternalSource && (
                <Row style={{ marginTop: '0.5rem' }}>
                  <Button
                    disabled={disabled}
                    icon="Add"
                    onPress={() =>
                      setContest({
                        ...contest,
                        candidates: [
                          ...contest.candidates,
                          createBlankCandidate(),
                        ],
                      })
                    }
                  >
                    Add Candidate
                  </Button>
                </Row>
              )}
            </div>
          </React.Fragment>
        )}

        {contest.type === 'yesno' && (
          <React.Fragment>
            <div>
              <FieldName>Description</FieldName>
              <RichTextEditorWithAudio
                // Reset editor to saved content after canceling
                key={`description-${editing}`}
                audioScreenUrl={audioUrl?.({
                  id: contest.id,
                  stringKey: ElectionStringKey.CONTEST_DESCRIPTION,
                  subkey: contest.id,
                })}
                disabled={disabled}
                editing={editing}
                initialHtmlContent={contest.description}
                onChange={(htmlContent) =>
                  setContest({ ...contest, description: htmlContent })
                }
              />
            </div>

            <div>
              <FieldName>Options</FieldName>
              <Column style={{ gap: '0.5rem' }}>
                <InputWithAudio
                  audioScreenUrl={audioUrl?.({
                    id: contest.id,
                    stringKey: ElectionStringKey.CONTEST_OPTION_LABEL,
                    subkey: contest.yesOption.id,
                  })}
                  disabled={disabled || hasExternalSource}
                  editing={editing}
                  type="text"
                  value={contest.yesOption.label}
                  onChange={(e) =>
                    setContest({
                      ...contest,
                      yesOption: {
                        ...contest.yesOption,
                        label: e.target.value,
                      },
                    })
                  }
                  autoComplete="off"
                />
                <InputWithAudio
                  audioScreenUrl={audioUrl?.({
                    id: contest.id,
                    stringKey: ElectionStringKey.CONTEST_OPTION_LABEL,
                    subkey: contest.noOption.id,
                  })}
                  disabled={disabled || hasExternalSource}
                  editing={editing}
                  type="text"
                  value={contest.noOption.label}
                  onChange={(e) =>
                    setContest({
                      ...contest,
                      noOption: { ...contest.noOption, label: e.target.value },
                    })
                  }
                  autoComplete="off"
                />
                {features.ADDITIONAL_BALLOT_MEASURE_OPTIONS && (
                  <React.Fragment>
                    {(contest.additionalOptions ?? []).map((option, index) => (
                      <Row key={option.id} style={{ gap: '0.5rem' }}>
                        <input
                          disabled={disabled || hasExternalSource}
                          type="text"
                          value={option.label}
                          onChange={(e) => {
                            const updatedOptions = (
                              contest.additionalOptions ??
                              /* @coverage-defer */ []
                            ).map((o, i) =>
                              i === index
                                ? { ...option, label: e.target.value }
                                : o
                            );
                            setContest({
                              ...contest,
                              additionalOptions: updatedOptions,
                            });
                          }}
                          autoComplete="off"
                        />
                        {!(disabled || hasExternalSource) && (
                          <TooltipContainer style={{ width: 'min-content' }}>
                            <Button
                              aria-label="Remove Option"
                              icon="Trash"
                              color="danger"
                              className="icon-button"
                              onPress={() => {
                                const updatedOptions = (
                                  contest.additionalOptions ??
                                  /* @coverage-defer */ []
                                ).filter((_, i) => i !== index);
                                setContest({
                                  ...contest,
                                  additionalOptions: updatedOptions,
                                });
                              }}
                            />
                            <Tooltip alignTo="right" bold>
                              Remove Option
                            </Tooltip>
                          </TooltipContainer>
                        )}
                      </Row>
                    ))}

                    <div>
                      <Button
                        icon="Add"
                        disabled={disabled || hasExternalSource}
                        onPress={() =>
                          setContest({
                            ...contest,
                            additionalOptions: [
                              ...(contest.additionalOptions ?? []),
                              {
                                id: generateId(),
                                label: '',
                              },
                            ],
                          })
                        }
                      >
                        Add Option
                      </Button>
                    </div>
                  </React.Fragment>
                )}
              </Column>
            </div>
          </React.Fragment>
        )}

        {contest.type === 'straight-party' && (
          <div>
            <FieldName>Options</FieldName>
            <Column style={{ gap: '0.5rem' }}>
              {contest.optionIds.map((partyId) => {
                const party = find(parties, (p) => p.id === partyId);
                return (
                  <input
                    key={partyId}
                    type="text"
                    value={party.fullName}
                    disabled
                  />
                );
              })}
            </Column>
          </div>
        )}
      </FormBody>

      <FormErrorContainer>{errorMessage}</FormErrorContainer>

      {!isLocked && contest.type !== 'straight-party' && (
        <FormFooter style={{ justifyContent: 'space-between' }}>
          <PrimaryFormActions disabled={disabled} editing={editing} />

          {savedContest && !hasExternalSource && (
            <Button
              variant="danger"
              fill="outlined"
              icon="Delete"
              onPress={() => setIsConfirmingDelete(true)}
              disabled={someMutationIsLoading}
            >
              Delete Contest
            </Button>
          )}
        </FormFooter>
      )}

      {savedContest && isConfirmingDelete && (
        <Modal
          title="Delete Contest"
          content={
            <div>
              <P>
                Are you sure you want to delete this contest? This action cannot
                be undone.
              </P>
            </div>
          }
          actions={
            <React.Fragment>
              <Button
                onPress={onDelete}
                variant="danger"
                autoFocus
                disabled={someMutationIsLoading}
              >
                Delete Contest
              </Button>
              <Button
                disabled={someMutationIsLoading}
                onPress={() => setIsConfirmingDelete(false)}
              >
                Cancel
              </Button>
            </React.Fragment>
          }
          onOverlayClick={
            // @coverage-exclude
            () => setIsConfirmingDelete(false)
          }
        />
      )}
    </Form>
  );
}

function PrimaryFormActions(props: { disabled: boolean; editing: boolean }) {
  const { disabled, editing } = props;

  if (!editing) {
    return (
      <Button icon="Edit" type="reset" variant="primary">
        Edit
      </Button>
    );
  }

  return (
    <Row style={{ flexWrap: 'wrap-reverse', gap: '0.5rem' }}>
      <Button disabled={disabled} type="reset">
        Cancel
      </Button>
      <Button type="submit" variant="primary" icon="Done" disabled={disabled}>
        Save
      </Button>
    </Row>
  );
}

interface DraftCandidate {
  id: CandidateId;
  firstName: string;
  middleName: string;
  lastName: string;
  partyIds?: PartyId[];
  designation?: string;
}

interface DraftCandidateContest {
  id: ContestId;
  type: 'candidate';
  districtId?: DistrictId;
  title: string;
  termDescription?: string;
  seats: number;
  allowWriteIns: boolean;
  candidates: DraftCandidate[];
  partyId?: PartyId;
}

interface DraftOption {
  id: string;
  label: string;
}

interface DraftYesNoContest {
  id: ContestId;
  type: 'yesno';
  districtId?: DistrictId;
  title: string;
  description: string;
  yesOption: DraftOption;
  noOption: DraftOption;
  additionalOptions?: readonly DraftOption[];
}

// Straight party contests aren't editable, but we still need them to type-check
type DraftStraightPartyContest = Omit<StraightPartyContest, 'districtId'> & {
  districtId?: DistrictId;
};

type DraftContest =
  | DraftCandidateContest
  | DraftYesNoContest
  | DraftStraightPartyContest;

function draftCandidateFromCandidate(candidate: Candidate): DraftCandidate {
  // @coverage-defer
  let firstName = candidate.firstName ?? '';
  let middleName = candidate.middleName ?? '';
  // @coverage-defer
  let lastName = candidate.lastName ?? '';

  // @coverage-defer
  if (!firstName && !middleName && !lastName) {
    const [firstPart, ...middleParts] = candidate.name.split(' ');
    firstName = firstPart ?? '';
    lastName = middleParts.pop() ?? '';
    middleName = middleParts.join(' ');
  }

  return {
    id: candidate.id,
    firstName,
    middleName,
    lastName,
    designation: candidate.designation,
    partyIds: candidate.partyIds?.slice(),
  };
}

function draftContestFromContest(contest: Contest): DraftContest {
  switch (contest.type) {
    case 'candidate':
      return {
        ...contest,
        candidates: contest.candidates.map(draftCandidateFromCandidate),
      };
    case 'yesno':
      return {
        ...contest,
        yesOption: contest.options[0],
        noOption: contest.options[1],
        additionalOptions:
          contest.options.length > 2 ? contest.options.slice(2) : undefined,
      };
    case 'straight-party':
      return { ...contest };
    default: {
      throwIllegalValue(contest, 'type');
    }
  }
}

function tryContestFromDraftContest(
  draftContest: DraftContest
): Result<Contest, z.ZodError> {
  assert(
    draftContest.type !== 'straight-party',
    'Straight party contests are not editable'
  );
  switch (draftContest.type) {
    case 'candidate':
      return safeParse(CandidateContestSchema, {
        ...draftContest,
        candidates: draftContest.candidates.map((candidate) => ({
          ...candidate,
          name: joinCandidateName(candidate),
        })),
      });

    case 'yesno':
      return safeParse(YesNoContestSchema, {
        ...draftContest,
        options: [
          draftContest.yesOption,
          draftContest.noOption,
          ...(draftContest.additionalOptions ?? []),
        ],
      });

    default: {
      throwIllegalValue(draftContest, 'type');
    }
  }
}

function createBlankCandidateContest(): DraftCandidateContest {
  return {
    id: generateId(),
    type: 'candidate',
    title: '',
    seats: 1,
    allowWriteIns: true,
    candidates: [],
  };
}

function createBlankYesNoContest(): DraftYesNoContest {
  return {
    id: generateId(),
    type: 'yesno',
    title: '',
    description: '',
    yesOption: {
      id: generateId(),
      label: 'Yes',
    },
    noOption: {
      id: generateId(),
      label: 'No',
    },
  };
}

function createBlankCandidate(): DraftCandidate {
  return {
    id: generateId(),
    firstName: '',
    middleName: '',
    lastName: '',
  };
}

function joinCandidateName(candidate: DraftCandidate) {
  return [candidate.firstName, candidate.middleName, candidate.lastName]
    .map((part) => part.trim())
    .filter((part) => part)
    .join(' ');
}
