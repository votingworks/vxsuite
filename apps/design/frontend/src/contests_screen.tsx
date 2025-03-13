import React, { useState } from 'react';
import {
  Button,
  Table,
  TH,
  TD,
  H1,
  LinkButton,
  P,
  SegmentedButton,
  SearchSelect,
  MainContent,
  MainHeader,
  Breadcrumbs,
  TabPanel,
  RouterTabBar,
  Modal,
} from '@votingworks/ui';
import {
  Redirect,
  Route,
  Switch,
  useHistory,
  useParams,
} from 'react-router-dom';
import {
  AnyContest,
  Candidate,
  CandidateContestSchema,
  CandidateId,
  ContestId,
  Contests,
  DistrictId,
  ElectionId,
  Party,
  PartyId,
  safeParse,
  YesNoContestSchema,
} from '@votingworks/types';
import { find, Result, throwIllegalValue } from '@votingworks/basics';
import styled from 'styled-components';
import { Flipper, Flipped } from 'react-flip-toolkit';
import { z } from 'zod';
import {
  FieldName,
  Form,
  FormActionsRow,
  InputGroup,
  Row,
  TableActionsRow,
} from './layout';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import {
  createContest,
  createParty,
  deleteContest,
  deleteParty,
  getBallotsFinalizedAt,
  getElection,
  getElectionInfo,
  listContests,
  listDistricts,
  listParties,
  reorderContests,
  updateContest,
  updateParty,
} from './api';
import { generateId, reorderElement, replaceAtIndex } from './utils';
import { RichTextEditor } from './rich_text_editor';
import { useTitle } from './hooks/use_title';

const ReorderableTr = styled.tr<{ isReordering: boolean }>`
  &:hover {
    background-color: ${(p) => p.isReordering && p.theme.colors.containerLow};
  }
`;

const FILTER_ALL = 'all';
const FILTER_NONPARTISAN = 'nonpartisan';

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

function ContestsTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const listContestsQuery = listContests.useQuery(electionId);
  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const listPartiesQuery = listParties.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const reorderContestsMutation = reorderContests.useMutation();
  const [filterDistrictId, setFilterDistrictId] = useState(FILTER_ALL);
  const [filterPartyId, setFilterPartyId] = useState(FILTER_ALL);
  const [reorderedContests, setReorderedContests] = useState<Contests>();

  if (
    !(
      listContestsQuery.isSuccess &&
      getElectionInfoQuery.isSuccess &&
      listDistrictsQuery.isSuccess &&
      listPartiesQuery.isSuccess &&
      getBallotsFinalizedAtQuery.isSuccess
    )
  ) {
    return null;
  }

  const contests = listContestsQuery.data;
  const electionInfo = getElectionInfoQuery.data;
  const districts = listDistrictsQuery.data;
  const parties = listPartiesQuery.data;
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const contestRoutes = routes.election(electionId).contests.contests;

  const filteredContests = contests.filter((contest) => {
    const matchesDistrict =
      filterDistrictId === FILTER_ALL ||
      contest.districtId === filterDistrictId;
    const matchesParty =
      filterPartyId === FILTER_ALL ||
      (filterPartyId === FILTER_NONPARTISAN
        ? contest.type === 'yesno' || contest.partyId === undefined
        : contest.type === 'candidate' && contest.partyId === filterPartyId);
    return matchesDistrict && matchesParty;
  });

  const canReorder =
    filterDistrictId === FILTER_ALL &&
    filterPartyId === FILTER_ALL &&
    contests.length > 0 &&
    !ballotsFinalizedAt;
  const isReordering = reorderedContests !== undefined;

  const contestsToShow = isReordering ? reorderedContests : filteredContests;

  const districtIdToName = new Map(
    districts.map((district) => [district.id, district.name])
  );
  const partyIdToName = new Map(parties.map((party) => [party.id, party.name]));

  function onSaveReorderedContests(updatedContests: Contests) {
    reorderContestsMutation.mutate(
      {
        electionId,
        contestIds: updatedContests.map((contest) => contest.id),
      },
      {
        onSuccess: () => {
          setReorderedContests(undefined);
        },
      }
    );
  }

  return (
    <TabPanel>
      {contests.length === 0 && (
        <P>You haven&apos;t added any contests to this election yet.</P>
      )}
      <TableActionsRow>
        <LinkButton
          variant="primary"
          icon="Add"
          to={contestRoutes.addContest.path}
          disabled={isReordering || !!ballotsFinalizedAt}
        >
          Add Contest
        </LinkButton>
        {contests.length > 0 && (
          <React.Fragment>
            <SearchSelect
              options={[
                { value: FILTER_ALL, label: 'All Districts' },
                ...districts.map((district) => ({
                  value: district.id,
                  label: district.name,
                })),
              ]}
              value={filterDistrictId}
              onChange={(value) => setFilterDistrictId(value ?? FILTER_ALL)}
              style={{ minWidth: '8rem' }}
              disabled={isReordering}
            />
            {electionInfo.type === 'primary' && (
              <SearchSelect
                options={[
                  { value: FILTER_ALL, label: 'All Parties' },
                  { value: FILTER_NONPARTISAN, label: 'Nonpartisan' },
                  ...parties.map((party) => ({
                    value: party.id,
                    label: party.name,
                  })),
                ]}
                value={filterPartyId}
                onChange={(value) => setFilterPartyId(value ?? FILTER_ALL)}
                style={{ minWidth: '8rem' }}
                disabled={isReordering}
              />
            )}
          </React.Fragment>
        )}
        <div style={{ marginLeft: 'auto' }}>
          {isReordering ? (
            <Row style={{ gap: '0.5rem' }}>
              <Button onPress={() => setReorderedContests(undefined)}>
                Cancel
              </Button>
              <Button
                onPress={() => onSaveReorderedContests(reorderedContests)}
                variant="primary"
                icon="Done"
                disabled={reorderContestsMutation.isLoading}
              >
                Save
              </Button>
            </Row>
          ) : (
            <Button
              onPress={() => setReorderedContests(contests)}
              disabled={!canReorder}
            >
              Reorder Contests
            </Button>
          )}
        </div>
      </TableActionsRow>
      {contests.length > 0 &&
        (contestsToShow.length === 0 ? (
          <React.Fragment>
            <P>
              There are no contests for the district
              {electionInfo.type === 'primary' ? '/party' : ''} you selected.
            </P>
            <P>
              <Button
                onPress={() => {
                  setFilterDistrictId(FILTER_ALL);
                  setFilterPartyId(FILTER_ALL);
                }}
              >
                Clear Selection
              </Button>
            </P>
          </React.Fragment>
        ) : (
          // Flipper/Flip are used to animate the reordering of contest rows
          /* @ts-expect-error: TS doesn't think Flipper is a valid component */
          <Flipper
            flipKey={contestsToShow.map((contest) => contest.id).join(',')}
            // Custom spring parameters to speed up the duration of the animation
            // See https://github.com/aholachek/react-flip-toolkit/issues/100#issuecomment-551056183
            spring={{ stiffness: 439, damping: 42 }}
          >
            <Table>
              <thead>
                <tr>
                  <TH>Title</TH>
                  <TH>Type</TH>
                  <TH>District</TH>
                  {electionInfo.type === 'primary' && <TH>Party</TH>}
                  <TH />
                </tr>
              </thead>
              <tbody>
                {contestsToShow.map((contest, index) => (
                  <Flipped
                    key={contest.id}
                    flipId={contest.id}
                    shouldFlip={() => isReordering}
                  >
                    <ReorderableTr key={contest.id} isReordering={isReordering}>
                      <TD>{contest.title}</TD>
                      <TD>
                        {contest.type === 'candidate'
                          ? 'Candidate Contest'
                          : 'Ballot Measure'}
                      </TD>
                      <TD nowrap>{districtIdToName.get(contest.districtId)}</TD>
                      {electionInfo.type === 'primary' && (
                        <TD nowrap>
                          {contest.type === 'candidate' &&
                            contest.partyId !== undefined &&
                            partyIdToName.get(contest.partyId)}
                        </TD>
                      )}
                      <TD nowrap style={{ height: '3rem' }}>
                        <Row
                          style={{ gap: '0.5rem', justifyContent: 'flex-end' }}
                        >
                          {isReordering ? (
                            <React.Fragment>
                              <Button
                                aria-label="Move Up"
                                icon="ChevronUp"
                                disabled={index === 0}
                                onPress={() =>
                                  setReorderedContests(
                                    reorderElement(
                                      reorderedContests,
                                      index,
                                      index - 1
                                    )
                                  )
                                }
                              />
                              <Button
                                aria-label="Move Down"
                                icon="ChevronDown"
                                disabled={index === contestsToShow.length - 1}
                                onPress={() =>
                                  setReorderedContests(
                                    reorderElement(
                                      reorderedContests,
                                      index,
                                      index + 1
                                    )
                                  )
                                }
                              />
                            </React.Fragment>
                          ) : (
                            <LinkButton
                              icon="Edit"
                              to={contestRoutes.editContest(contest.id).path}
                              disabled={!!ballotsFinalizedAt}
                            >
                              Edit
                            </LinkButton>
                          )}
                        </Row>
                      </TD>
                    </ReorderableTr>
                  </Flipped>
                ))}
              </tbody>
            </Table>
          </Flipper>
        ))}
    </TabPanel>
  );
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

function ContestForm({
  electionId,
  savedContest,
}: {
  electionId: ElectionId;
  savedContest?: AnyContest;
}): JSX.Element | null {
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
  const updatedContestMutation = updateContest.useMutation();
  const deleteContestMutation = deleteContest.useMutation();
  const history = useHistory();
  const contestRoutes = routes.election(electionId).contests;
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

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

  // After deleting a contest, this component may re-render briefly with no
  // contest before redirecting to the contests list. We can just render
  // nothing in that case.
  /* istanbul ignore next - @preserve */
  if (!contest) {
    return null;
  }

  function goBackToContestsList() {
    history.push(contestRoutes.root.path);
  }

  function onSubmit() {
    const formContest = tryContestFromDraftContest(contest).unsafeUnwrap();
    if (savedContest) {
      updatedContestMutation.mutate(
        { electionId, updatedContest: formContest },
        { onSuccess: goBackToContestsList }
      );
    } else {
      createContestMutation.mutate(
        { electionId, newContest: formContest },
        { onSuccess: goBackToContestsList }
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
    updatedContestMutation.isLoading ||
    deleteContestMutation.isLoading;

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
              max={10}
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

function AddContestForm(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const contestRoutes = routes.election(electionId).contests;
  const { title } = contestRoutes.contests.addContest;

  return (
    <React.Fragment>
      <MainHeader>
        <Breadcrumbs
          currentTitle={title}
          parentRoutes={[contestRoutes.contests.root]}
        />
        <H1>{title}</H1>
      </MainHeader>
      <MainContent>
        <ContestForm electionId={electionId} />
      </MainContent>
    </React.Fragment>
  );
}

function EditContestForm(): JSX.Element | null {
  const { electionId, contestId } = useParams<
    ElectionIdParams & { contestId: ContestId }
  >();
  const listContestsQuery = listContests.useQuery(electionId);
  const contestRoutes = routes.election(electionId).contests;

  if (!listContestsQuery.isSuccess) {
    return null;
  }

  const contests = listContestsQuery.data;
  const savedContest = find(contests, (c) => c.id === contestId);
  const { title } = contestRoutes.contests.editContest(contestId);

  return (
    <React.Fragment>
      <MainHeader>
        <Breadcrumbs
          currentTitle={title}
          parentRoutes={[contestRoutes.contests.root]}
        />
        <H1>{title}</H1>
      </MainHeader>
      <MainContent>
        <ContestForm electionId={electionId} savedContest={savedContest} />
      </MainContent>
    </React.Fragment>
  );
}

function PartiesTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const listPartiesQuery = listParties.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  if (!(listPartiesQuery.isSuccess && getBallotsFinalizedAtQuery.isSuccess)) {
    return null;
  }

  const parties = listPartiesQuery.data;
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const partyRoutes = routes.election(electionId).contests.parties;

  return (
    <TabPanel>
      {parties.length === 0 && (
        <P>You haven&apos;t added any parties to this election yet.</P>
      )}
      <TableActionsRow>
        <LinkButton
          icon="Add"
          variant="primary"
          to={partyRoutes.addParty.path}
          disabled={!!ballotsFinalizedAt}
        >
          Add Party
        </LinkButton>
      </TableActionsRow>
      {parties.length > 0 && (
        <Table>
          <thead>
            <tr>
              <TH>Name</TH>
              <TH>Abbreviation</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {parties.map((party) => (
              <tr key={party.id}>
                <TD>{party.fullName}</TD>
                <TD>{party.abbrev}</TD>
                <TD>
                  <LinkButton
                    icon="Edit"
                    to={partyRoutes.editParty(party.id).path}
                    disabled={!!ballotsFinalizedAt}
                  >
                    Edit
                  </LinkButton>
                </TD>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </TabPanel>
  );
}

function createBlankParty(): Party {
  return {
    id: generateId() as PartyId,
    name: '',
    fullName: '',
    abbrev: '',
  };
}

function PartyForm({
  electionId,
  savedParty,
}: {
  electionId: ElectionId;
  savedParty?: Party;
}): JSX.Element {
  const [party, setParty] = useState<Party>(
    savedParty ??
      // To make mocked IDs predictable in tests, we pass a function here
      // so it will only be called on initial render.
      createBlankParty
  );
  const createPartyMutation = createParty.useMutation();
  const updatePartyMutation = updateParty.useMutation();
  const deletePartyMutation = deleteParty.useMutation();
  const history = useHistory();
  const partyRoutes = routes.election(electionId).contests.parties;
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  function goBackToPartiesList() {
    history.push(partyRoutes.root.path);
  }

  function onSubmit() {
    if (savedParty) {
      updatePartyMutation.mutate(
        { electionId, updatedParty: party },
        { onSuccess: goBackToPartiesList }
      );
    } else {
      createPartyMutation.mutate(
        { electionId, newParty: party },
        { onSuccess: goBackToPartiesList }
      );
    }
  }

  function onDelete() {
    deletePartyMutation.mutate(
      { electionId, partyId: party.id },
      { onSuccess: goBackToPartiesList }
    );
  }

  const someMutationIsLoading =
    createPartyMutation.isLoading ||
    updatePartyMutation.isLoading ||
    deletePartyMutation.isLoading;

  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onReset={(e) => {
        e.preventDefault();
        goBackToPartiesList();
      }}
    >
      <InputGroup label="Full Name">
        <input
          type="text"
          value={party.fullName}
          onChange={(e) => setParty({ ...party, fullName: e.target.value })}
          onBlur={(e) =>
            setParty({ ...party, fullName: e.target.value.trim() })
          }
          autoComplete="off"
          required
        />
      </InputGroup>
      <InputGroup label="Short Name">
        <input
          type="text"
          value={party.name}
          onChange={(e) => setParty({ ...party, name: e.target.value })}
          onBlur={(e) => setParty({ ...party, name: e.target.value.trim() })}
          autoComplete="off"
          required
        />
      </InputGroup>
      <InputGroup label="Abbreviation">
        <input
          type="text"
          value={party.abbrev}
          onChange={(e) => setParty({ ...party, abbrev: e.target.value })}
          onBlur={(e) => setParty({ ...party, abbrev: e.target.value.trim() })}
          autoComplete="off"
          required
        />
      </InputGroup>
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
        {savedParty && (
          <FormActionsRow style={{ marginTop: '1rem' }}>
            <Button
              variant="danger"
              icon="Delete"
              onPress={() => setIsConfirmingDelete(true)}
              disabled={someMutationIsLoading}
            >
              Delete Party
            </Button>
          </FormActionsRow>
        )}
        {savedParty && isConfirmingDelete && (
          <Modal
            title="Delete Party"
            content={
              <P>
                Are you sure you want to delete this party? This action cannot
                be undone.
              </P>
            }
            actions={
              <React.Fragment>
                <Button onPress={onDelete} variant="danger" autoFocus>
                  Delete Party
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

function AddPartyForm(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const partyRoutes = routes.election(electionId).contests.parties;
  const { title } = partyRoutes.addParty;

  return (
    <React.Fragment>
      <MainHeader>
        <Breadcrumbs currentTitle={title} parentRoutes={[partyRoutes.root]} />
        <H1>{title}</H1>
      </MainHeader>
      <MainContent>
        <PartyForm electionId={electionId} />
      </MainContent>
    </React.Fragment>
  );
}

function EditPartyForm(): JSX.Element | null {
  const { electionId, partyId } = useParams<
    ElectionIdParams & { partyId: string }
  >();
  const listPartiesQuery = listParties.useQuery(electionId);
  const partyRoutes = routes.election(electionId).contests.parties;

  /* istanbul ignore next - @preserve */
  if (!listPartiesQuery.isSuccess) {
    return null;
  }

  const parties = listPartiesQuery.data;
  const savedParty = find(parties, (p) => p.id === partyId);
  const { title } = partyRoutes.editParty(partyId);

  return (
    <React.Fragment>
      <MainHeader>
        <Breadcrumbs currentTitle={title} parentRoutes={[partyRoutes.root]} />
        <H1>{title}</H1>
      </MainHeader>
      <MainContent>
        <PartyForm electionId={electionId} savedParty={savedParty} />
      </MainContent>
    </React.Fragment>
  );
}

export function ContestsScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const contestParamRoutes = electionParamRoutes.contests;
  const contestRoutes = routes.election(electionId).contests;
  const getElectionQuery = getElection.useQuery(electionId);
  useTitle(
    routes.election(electionId).contests.root.title,
    getElectionQuery.data?.election.title
  );
  return (
    <ElectionNavScreen electionId={electionId}>
      <Switch>
        <Route
          path={contestParamRoutes.contests.addContest.path}
          exact
          component={AddContestForm}
        />
        <Route
          path={contestParamRoutes.contests.editContest(':contestId').path}
          exact
          component={EditContestForm}
        />
        <Route
          path={contestParamRoutes.parties.addParty.path}
          exact
          component={AddPartyForm}
        />
        <Route
          path={contestParamRoutes.parties.editParty(':partyId').path}
          exact
          component={EditPartyForm}
        />
        <Route path={contestParamRoutes.root.path}>
          <MainHeader>
            <H1>Contests</H1>
          </MainHeader>
          <MainContent>
            <RouterTabBar
              tabs={[contestRoutes.contests.root, contestRoutes.parties.root]}
            />
            <Switch>
              <Route
                path={contestParamRoutes.contests.root.path}
                component={ContestsTab}
              />
              <Route
                path={contestParamRoutes.parties.root.path}
                component={PartiesTab}
              />
              <Redirect
                from={contestParamRoutes.root.path}
                to={contestParamRoutes.contests.root.path}
              />
            </Switch>
          </MainContent>
        </Route>
      </Switch>
    </ElectionNavScreen>
  );
}
