import React, { useState } from 'react';
import {
  Button,
  Table,
  TH,
  TD,
  P,
  SegmentedButton,
  SearchSelect,
  Modal,
  Callout,
} from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import {
  AnyContest,
  Candidate,
  CandidateContestSchema,
  CandidateId,
  ContestId,
  DistrictId,
  ElectionId,
  PartyId,
  safeParse,
  YesNoContestSchema,
} from '@votingworks/types';
import { Result, throwIllegalValue } from '@votingworks/basics';
import { z } from 'zod/v4';
import { FieldName, Form, FormActionsRow, InputGroup, Row } from './layout';
import { routes } from './routes';
import {
  createContest,
  deleteContest,
  getElectionInfo,
  listDistricts,
  listParties,
  updateContest,
} from './api';
import { generateId, replaceAtIndex } from './utils';
import { RichTextEditor } from './rich_text_editor';

export interface ContestFormProps {
  electionId: ElectionId;
  savedContest?: AnyContest;
}

export function ContestForm(props: ContestFormProps): React.ReactNode {
  const { electionId, savedContest } = props;
  const [contest, setContest] = useState<DraftContest>(
    savedContest
      ? draftContestFromContest(savedContest)
      : // To make mocked IDs predictable in tests, we pass a function here
        // so it will only be called on initial render.
        createBlankCandidateContest
  );
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
    !(
      getElectionInfoQuery.isSuccess &&
      listDistrictsQuery.isSuccess &&
      listPartiesQuery.isSuccess
    )
  ) {
    return null;
  }
  const electionInfo = getElectionInfoQuery.data;
  const districts = listDistrictsQuery.data;
  const parties = listPartiesQuery.data;

  function goBackToContestsList() {
    history.push(contestRoutes.root.path);
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
            if (result.isOk()) {
              goBackToContestsList();
            }
          },
        }
      );
    } else {
      createContestMutation.mutate(
        { electionId, newContest: formContest },
        {
          onSuccess: (result) => {
            if (result.isOk()) {
              goBackToContestsList();
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

  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onReset={(e) => {
        e.preventDefault();
        goBackToContestsList();
      }}
    >
      <InputGroup label="Title">
        <input
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
      <SegmentedButton
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
        <React.Fragment>
          {electionInfo.type === 'primary' && (
            <InputGroup label="Party">
              <SearchSelect
                aria-label="Party"
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
          <InputGroup label="Seats">
            <input
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
              type="text"
              value={contest.termDescription ?? ''}
              onChange={(e) =>
                setContest({ ...contest, termDescription: e.target.value })
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
          <SegmentedButton
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
          <div>
            <FieldName>Candidates</FieldName>
            {contest.candidates.length === 0 && (
              <P style={{ marginTop: '0.5rem' }}>
                You haven&apos;t added any candidates to this contest yet.
              </P>
            )}
            {contest.candidates.length > 0 && (
              <Table>
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
                          type="text"
                          value={candidate.firstName}
                          // eslint-disable-next-line jsx-a11y/no-autofocus
                          autoFocus
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
                          style={{ minWidth: '12rem !important' }}
                        />
                      </TD>
                      <TD>
                        <Button
                          icon="Delete"
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
                        >
                          Remove
                        </Button>
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <Row style={{ marginTop: '0.5rem' }}>
              <Button
                icon="Add"
                onPress={() =>
                  setContest({
                    ...contest,
                    candidates: [...contest.candidates, createBlankCandidate()],
                  })
                }
              >
                Add Candidate
              </Button>
            </Row>
          </div>
        </React.Fragment>
      )}

      {contest.type === 'yesno' && (
        <React.Fragment>
          <div>
            <FieldName>Description</FieldName>
            <RichTextEditor
              initialHtmlContent={contest.description}
              onChange={(htmlContent) =>
                setContest({ ...contest, description: htmlContent })
              }
            />
          </div>

          <InputGroup label="First Option Label">
            <input
              type="text"
              value={contest.yesOption.label}
              onChange={(e) =>
                setContest({
                  ...contest,
                  yesOption: { ...contest.yesOption, label: e.target.value },
                })
              }
              autoComplete="off"
              style={{ width: '4rem' }}
            />
          </InputGroup>

          <InputGroup label="Second Option Label">
            <input
              type="text"
              value={contest.noOption.label}
              onChange={(e) =>
                setContest({
                  ...contest,
                  noOption: { ...contest.noOption, label: e.target.value },
                })
              }
              autoComplete="off"
              style={{ width: '4rem' }}
            />
          </InputGroup>
        </React.Fragment>
      )}

      {errorMessage}
      <div>
        <FormActionsRow>
          <Button type="reset">Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            icon="Done"
            disabled={someMutationIsLoading}
          >
            Save
          </Button>
        </FormActionsRow>
        {savedContest && (
          <FormActionsRow style={{ marginTop: '1rem' }}>
            <Button
              variant="danger"
              icon="Delete"
              onPress={() => setIsConfirmingDelete(true)}
              disabled={someMutationIsLoading}
            >
              Delete Contest
            </Button>
          </FormActionsRow>
        )}
        {savedContest && isConfirmingDelete && (
          <Modal
            title="Delete Contest"
            content={
              <div>
                <P>
                  Are you sure you want to delete this contest? This action
                  cannot be undone.
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
                <Button onPress={() => setIsConfirmingDelete(false)}>
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
      </div>
    </Form>
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
          name: [candidate.firstName, candidate.middleName, candidate.lastName]
            .map((part) => part.trim())
            .filter((part) => part)
            .join(' '),
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
