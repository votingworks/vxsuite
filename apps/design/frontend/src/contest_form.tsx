import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { z } from 'zod/v4';

import { Result, throwIllegalValue } from '@votingworks/basics';
import {
  ElectionId,
  AnyContest,
  DistrictId,
  PartyId,
  Candidate,
  CandidateContestSchema,
  CandidateId,
  ContestId,
  safeParse,
  YesNoContestSchema,
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

import {
  getBallotsFinalizedAt,
  getElectionInfo,
  listDistricts,
  listParties,
  createContest,
  updateContest,
  deleteContest,
} from './api';
import {
  FormFixed,
  FormBody,
  FormErrorContainer,
  FormFooter,
} from './form_fixed';
import { InputGroup, Row, FieldName } from './layout';
import { routes } from './routes';
import { TooltipContainer, Tooltip } from './tooltip';
import { generateId, replaceAtIndex } from './utils';
import { RichTextEditor } from './rich_text_editor';

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
`;

const InputRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
`;

const CandidateInputTable = styled(Table)`
  max-width: 70rem;

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
  editing: boolean;
  electionId: ElectionId;
  savedContest?: AnyContest;
}

export function ContestForm(props: ContestFormProps): React.ReactNode {
  const { editing, electionId, savedContest } = props;
  const [contest, setContest] = useState<DraftContest>(
    savedContest
      ? draftContestFromContest(savedContest)
      : // To make mocked IDs predictable in tests, we pass a function here
        // so it will only be called on initial render.
        createBlankCandidateContest
  );
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const listPartiesQuery = listParties.useQuery(electionId);
  const createContestMutation = createContest.useMutation();
  const updateContestMutation = updateContest.useMutation();
  const deleteContestMutation = deleteContest.useMutation();
  const history = useHistory();
  const contestRoutes = routes.election(electionId).contests;
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [validationErrorMessage, setValidationErrorMessage] = useState<
    string | null
  >(null);

  /* istanbul ignore next - @preserve */
  if (
    !getElectionInfoQuery.isSuccess ||
    !listDistrictsQuery.isSuccess ||
    !getBallotsFinalizedAtQuery.isSuccess ||
    !listPartiesQuery.isSuccess
  ) {
    return null;
  }
  const electionInfo = getElectionInfoQuery.data;
  const districts = listDistrictsQuery.data;
  const parties = listPartiesQuery.data;
  const isFinalized = !!getBallotsFinalizedAtQuery.data;

  function goBackToContestsList() {
    history.replace(contestRoutes.root.path);
  }

  function setEditing(switchToEdit: boolean) {
    if (!savedContest) return goBackToContestsList();

    history.replace(
      switchToEdit
        ? contestRoutes.edit(savedContest.id).path
        : // [TODO] Go to contestRoutes.view() instead once the contest list is
          // co-located with the form.
          contestRoutes.root.path
    );
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
            if (result.isOk()) {
              // [TODO] Go to contestRoutes.view() for the new contest instead
              // once the contest list is co-located with the form.
              setEditing(false);
            }
          },
        }
      );
    }
  }

  function onDelete() {
    deleteContestMutation.mutate(
      { electionId, contestId: contest.id },
      { onSuccess: goBackToContestsList }
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
          /* istanbul ignore next - @preserve */
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
          savedContest
            ? draftContestFromContest(savedContest)
            : createBlankCandidateContest
        );
        setEditing(!editing);
      }}
    >
      <FormBody>
        <InputGroup label="Title">
          <input
            disabled={disabled}
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
            disabled={disabled}
            value={contest.districtId || undefined}
            onChange={(value) => {
              setContest({ ...contest, districtId: value || undefined });
            }}
            options={[
              { value: '' as DistrictId, label: '' },
              ...districts.map((district) => ({
                value: district.id,
                label: district.name,
              })),
            ]}
            required
          />
        </InputGroup>
        <InputRow>
          <SegmentedButton
            disabled={disabled}
            label="Type"
            options={[
              { id: 'candidate', label: 'Candidate Contest' },
              { id: 'yesno', label: 'Ballot Measure' },
            ]}
            selectedOptionId={contest.type}
            onChange={(type) =>
              setContest({
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

        {contest.type === 'candidate' && (
          <React.Fragment>
            {electionInfo.type === 'primary' && (
              <InputGroup label="Party">
                <SearchSelect
                  aria-label="Party"
                  disabled={disabled}
                  options={[
                    { value: '' as PartyId, label: 'No Party Affiliation' },
                    ...parties.map((party) => ({
                      value: party.id,
                      label: party.name,
                    })),
                  ]}
                  value={contest.partyId}
                  onChange={(value) =>
                    setContest({
                      ...contest,
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
                <input
                  disabled={disabled}
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
                      <TH />
                    </tr>
                  </thead>
                  <tbody>
                    {contest.candidates.map((candidate, index) => (
                      <tr key={candidate.id}>
                        <TD>
                          <input
                            aria-label={`Candidate ${index + 1} First Name`}
                            disabled={disabled}
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
                            disabled={disabled}
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
                            disabled={disabled}
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
                            disabled={disabled}
                            options={[
                              {
                                value: '' as PartyId,
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
                        <TD>
                          {/* [TODO] Show audio edit button when not editing. */}
                          {editing && (
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
                          )}
                        </TD>
                      </tr>
                    ))}
                  </tbody>
                </CandidateInputTable>
              )}

              {editing && (
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
              <RichTextEditor
                disabled={disabled}
                initialHtmlContent={contest.description}
                onChange={(htmlContent) =>
                  setContest({ ...contest, description: htmlContent })
                }
              />
            </div>

            <InputGroup label="First Option Label">
              <input
                disabled={disabled}
                type="text"
                value={contest.yesOption.label}
                onChange={(e) =>
                  setContest({
                    ...contest,
                    yesOption: { ...contest.yesOption, label: e.target.value },
                  })
                }
                autoComplete="off"
              />
            </InputGroup>

            <InputGroup label="Second Option Label">
              <input
                disabled={disabled}
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
            </InputGroup>
          </React.Fragment>
        )}
      </FormBody>

      <FormErrorContainer>{errorMessage}</FormErrorContainer>

      {!isFinalized && (
        <FormFooter style={{ justifyContent: 'space-between' }}>
          <PrimaryFormActions disabled={disabled} editing={editing} />

          {savedContest && (
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
            /* istanbul ignore next - @preserve */
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

interface DraftYesNoContest {
  id: ContestId;
  type: 'yesno';
  districtId?: DistrictId;
  title: string;
  description: string;
  yesOption: { id: string; label: string };
  noOption: { id: string; label: string };
}

type DraftContest = DraftCandidateContest | DraftYesNoContest;

function draftCandidateFromCandidate(candidate: Candidate): DraftCandidate {
  let firstName = candidate.firstName ?? '';
  let middleName = candidate.middleName ?? '';
  let lastName = candidate.lastName ?? '';

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
    partyIds: candidate.partyIds?.slice(),
  };
}

function draftContestFromContest(contest: AnyContest): DraftContest {
  switch (contest.type) {
    case 'candidate':
      return {
        ...contest,
        candidates: contest.candidates.map(draftCandidateFromCandidate),
      };
    case 'yesno':
      return { ...contest };
    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(contest, 'type');
    }
  }
}

function tryContestFromDraftContest(
  draftContest: DraftContest
): Result<AnyContest, z.ZodError> {
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
      return safeParse(YesNoContestSchema, draftContest);

    default: {
      /* istanbul ignore next - @preserve */
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
