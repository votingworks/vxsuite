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
  CandidateContest,
  ContestId,
  Contests,
  DistrictId,
  Election,
  Id,
  Party,
  PartyId,
  YesNoContest,
} from '@votingworks/types';
import { assert, find } from '@votingworks/basics';
import styled from 'styled-components';
import { Flipper, Flipped } from 'react-flip-toolkit';
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
import { TabPanel, TabBar } from './tabs';
import { getElection, updateElection } from './api';
import { generateId, reorderElement, replaceAtIndex } from './utils';

const ReorderableTr = styled.tr<{ isReordering: boolean }>`
  &:hover {
    background-color: ${(p) => p.isReordering && p.theme.colors.containerLow};
  }
`;

const FILTER_ALL = 'all';
const FILTER_NONPARTISAN = 'nonpartisan';

function ContestsTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);
  const updateElectionMutation = updateElection.useMutation();
  const [filterDistrictId, setFilterDistrictId] = useState(FILTER_ALL);
  const [filterPartyId, setFilterPartyId] = useState(FILTER_ALL);
  const [reorderedContests, setReorderedContests] = useState<Contests>();

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { election } = getElectionQuery.data;
  const { contests, districts, parties } = election;
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
    contests.length > 0;
  const isReordering = reorderedContests !== undefined;

  const contestsToShow = isReordering ? reorderedContests : filteredContests;

  const districtIdToName = new Map(
    districts.map((district) => [district.id, district.name])
  );
  const partyIdToName = new Map(parties.map((party) => [party.id, party.name]));

  function onSaveReorderedContests(updatedContests: Contests) {
    updateElectionMutation.mutate(
      {
        electionId,
        election: {
          ...election,
          contests: updatedContests,
        },
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
          disabled={isReordering}
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
            {election.type === 'primary' && (
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
                disabled={updateElectionMutation.isLoading}
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
              {election.type === 'primary' ? '/party' : ''} you selected.
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
                  {election.type === 'primary' && <TH>Party</TH>}
                  <TH />
                </tr>
              </thead>
              <tbody>
                {contestsToShow.map((contest, index) => (
                  <Flipped key={contest.id} flipId={contest.id}>
                    <ReorderableTr key={contest.id} isReordering={isReordering}>
                      <TD>{contest.title}</TD>
                      <TD>
                        {contest.type === 'candidate'
                          ? 'Candidate Contest'
                          : 'Ballot Measure'}
                      </TD>
                      <TD nowrap>{districtIdToName.get(contest.districtId)}</TD>
                      {election.type === 'primary' && (
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

function createBlankCandidateContest(): CandidateContest {
  return {
    id: generateId(),
    type: 'candidate',
    districtId: '' as DistrictId,
    title: '',
    seats: 1,
    allowWriteIns: true,
    candidates: [],
  };
}

function createBlankYesNoContest(): YesNoContest {
  return {
    id: generateId(),
    type: 'yesno',
    districtId: '' as DistrictId,
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

function createBlankCandidate(): Candidate {
  return {
    id: generateId(),
    name: '',
  };
}

function ContestForm({
  electionId,
  contestId,
  savedElection,
}: {
  electionId: Id;
  contestId?: ContestId;
  savedElection: Election;
}): JSX.Element | null {
  const savedContests = savedElection.contests;
  const [contest, setContest] = useState<AnyContest>(
    contestId
      ? find(savedContests, (c) => c.id === contestId)
      : // To make mocked IDs predictable in tests, we pass a function here
        // so it will only be called on initial render.
        createBlankCandidateContest
  );
  const updateElectionMutation = updateElection.useMutation();
  const history = useHistory();
  const contestRoutes = routes.election(electionId).contests;

  function onSavePress(updatedContest: AnyContest) {
    const newContests = contestId
      ? savedContests.map((c) => (c.id === contestId ? updatedContest : c))
      : [...savedContests, updatedContest];
    updateElectionMutation.mutate(
      {
        electionId,
        election: {
          ...savedElection,
          contests: newContests,
        },
      },
      {
        onSuccess: () => {
          history.push(contestRoutes.root.path);
        },
      }
    );
  }

  function onDeletePress(id: ContestId) {
    const newContests = savedContests.filter((c) => c.id !== id);
    updateElectionMutation.mutate(
      {
        electionId,
        election: {
          ...savedElection,
          contests: newContests,
        },
      },
      {
        onSuccess: () => {
          history.push(contestRoutes.root.path);
        },
      }
    );
  }

  return (
    <Form>
      <InputGroup label="Title">
        <input
          type="text"
          value={contest.title}
          onChange={(e) => setContest({ ...contest, title: e.target.value })}
        />
      </InputGroup>
      <InputGroup label="District">
        <SearchSelect
          value={contest.districtId}
          onChange={(value) =>
            setContest({ ...contest, districtId: value ?? ('' as DistrictId) })
          }
          options={[
            { value: '' as DistrictId, label: '' },
            ...savedElection.districts.map((district) => ({
              value: district.id,
              label: district.name,
            })),
          ]}
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
          {savedElection.type === 'primary' && (
            <InputGroup label="Party">
              <SearchSelect
                ariaLabel="Party"
                options={[
                  { value: '' as PartyId, label: 'No Party Affiliation' },
                  ...savedElection.parties.map((party) => ({
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
                    <TH>Name</TH>
                    <TH>Party</TH>
                    <TH />
                  </tr>
                </thead>
                <tbody>
                  {contest.candidates.map((candidate, index) => (
                    <tr key={candidate.id}>
                      <TD>
                        <input
                          aria-label={`Candidate ${index + 1} Name`}
                          type="text"
                          value={candidate.name}
                          // eslint-disable-next-line jsx-a11y/no-autofocus
                          autoFocus
                          onChange={(e) =>
                            setContest({
                              ...contest,
                              candidates: replaceAtIndex(
                                contest.candidates,
                                index,
                                {
                                  ...candidate,
                                  name: e.target.value,
                                }
                              ),
                            })
                          }
                        />
                      </TD>
                      <TD>
                        <SearchSelect
                          ariaLabel={`Candidate ${index + 1} Party`}
                          options={[
                            {
                              value: '' as PartyId,
                              label: 'No Party Affiliation',
                            },
                            ...savedElection.parties.map((party) => ({
                              value: party.id,
                              label: party.name,
                            })),
                          ]}
                          // Only support one party per candidate for now
                          value={candidate.partyIds?.[0] ?? ('' as PartyId)}
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
        <InputGroup label="Description">
          <textarea
            style={{ width: '100%', height: '10rem' }}
            value={contest.description}
            onChange={(e) =>
              setContest({ ...contest, description: e.target.value })
            }
          />
        </InputGroup>
      )}

      <div>
        <FormActionsRow>
          <LinkButton to={contestRoutes.root.path}>Cancel</LinkButton>
          <Button
            onPress={() => onSavePress(contest)}
            variant="primary"
            icon="Done"
            disabled={updateElectionMutation.isLoading}
          >
            Save
          </Button>
        </FormActionsRow>
        {contestId && (
          <FormActionsRow style={{ marginTop: '1rem' }}>
            <Button
              variant="danger"
              icon="Delete"
              onPress={() => onDeletePress(contestId)}
            >
              Delete Contest
            </Button>
          </FormActionsRow>
        )}
      </div>
    </Form>
  );
}

function AddContestForm(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);
  const contestRoutes = routes.election(electionId).contests;

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { election } = getElectionQuery.data;
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
        <ContestForm electionId={electionId} savedElection={election} />
      </MainContent>
    </React.Fragment>
  );
}

function EditContestForm(): JSX.Element | null {
  const { electionId, contestId } = useParams<
    ElectionIdParams & { contestId: string }
  >();
  const getElectionQuery = getElection.useQuery(electionId);
  const contestRoutes = routes.election(electionId).contests;

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { election } = getElectionQuery.data;
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
        <ContestForm
          electionId={electionId}
          contestId={contestId}
          savedElection={election}
        />
      </MainContent>
    </React.Fragment>
  );
}

function PartiesTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const {
    election: { parties },
  } = getElectionQuery.data;
  const partyRoutes = routes.election(electionId).contests.parties;

  return (
    <TabPanel>
      {parties.length === 0 && (
        <P>You haven&apos;t added any parties to this election yet.</P>
      )}
      <TableActionsRow>
        <LinkButton icon="Add" variant="primary" to={partyRoutes.addParty.path}>
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
  partyId,
  savedElection,
}: {
  electionId: Id;
  partyId?: PartyId;
  savedElection: Election;
}): JSX.Element {
  const savedParties = savedElection.parties;
  const [party, setParty] = useState<Party>(
    partyId
      ? find(savedParties, (p) => p.id === partyId)
      : // To make mocked IDs predictable in tests, we pass a function here
        // so it will only be called on initial render.
        createBlankParty
  );
  const updateElectionMutation = updateElection.useMutation();
  const history = useHistory();
  const partyRoutes = routes.election(electionId).contests.parties;

  function onSavePress(updatedParty: Party) {
    const newParties = partyId
      ? savedParties.map((p) => (p.id === partyId ? updatedParty : p))
      : [...savedParties, updatedParty];
    updateElectionMutation.mutate(
      {
        electionId,
        election: {
          ...savedElection,
          parties: newParties,
        },
      },
      {
        onSuccess: () => {
          history.push(partyRoutes.root.path);
        },
      }
    );
  }

  function onDeletePress(id: PartyId) {
    const newParties = savedParties.filter((p) => p.id !== id);
    // When deleting a party, we need to remove it from any contests/candidates
    // that reference it
    updateElectionMutation.mutate(
      {
        electionId,
        election: {
          ...savedElection,
          parties: newParties,
          contests: savedElection.contests.map((contest) => {
            if (contest.type === 'candidate') {
              const newPartyId =
                contest.partyId === partyId ? undefined : contest.partyId;
              return {
                ...contest,
                partyId: newPartyId,
                candidates: contest.candidates.map((candidate) => {
                  const { partyIds, ...rest } = candidate;
                  // Only support one party per candidate for now
                  assert(!partyIds || partyIds.length === 1);
                  if (partyIds?.[0] === partyId) {
                    return rest;
                  }
                  return candidate;
                }),
              };
            }
            return contest;
          }),
        },
      },
      {
        onSuccess: () => {
          history.push(partyRoutes.root.path);
        },
      }
    );
  }

  return (
    <Form>
      <InputGroup label="Full Name">
        <input
          type="text"
          value={party.fullName}
          onChange={(e) => setParty({ ...party, fullName: e.target.value })}
        />
      </InputGroup>
      <InputGroup label="Short Name">
        <input
          type="text"
          value={party.name}
          onChange={(e) => setParty({ ...party, name: e.target.value })}
        />
      </InputGroup>
      <InputGroup label="Abbreviation">
        <input
          type="text"
          value={party.abbrev}
          onChange={(e) => setParty({ ...party, abbrev: e.target.value })}
        />
      </InputGroup>
      <div>
        <FormActionsRow>
          <LinkButton to={partyRoutes.root.path}>Cancel</LinkButton>
          <Button
            onPress={() => onSavePress(party)}
            variant="primary"
            icon="Done"
            disabled={updateElectionMutation.isLoading}
          >
            Save
          </Button>
        </FormActionsRow>
        {partyId && (
          <FormActionsRow style={{ marginTop: '1rem' }}>
            <Button
              variant="danger"
              icon="Delete"
              onPress={() => onDeletePress(partyId)}
            >
              Delete Party
            </Button>
          </FormActionsRow>
        )}
      </div>
    </Form>
  );
}

function AddPartyForm(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);
  const partyRoutes = routes.election(electionId).contests.parties;

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { election } = getElectionQuery.data;
  const { title } = partyRoutes.addParty;

  return (
    <React.Fragment>
      <MainHeader>
        <Breadcrumbs currentTitle={title} parentRoutes={[partyRoutes.root]} />
        <H1>{title}</H1>
      </MainHeader>
      <MainContent>
        <PartyForm electionId={electionId} savedElection={election} />
      </MainContent>
    </React.Fragment>
  );
}

function EditPartyForm(): JSX.Element | null {
  const { electionId, partyId } = useParams<
    ElectionIdParams & { partyId: string }
  >();
  const getElectionQuery = getElection.useQuery(electionId);
  const partyRoutes = routes.election(electionId).contests.parties;

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { election } = getElectionQuery.data;
  const { title } = partyRoutes.editParty(partyId);

  return (
    <React.Fragment>
      <MainHeader>
        <Breadcrumbs currentTitle={title} parentRoutes={[partyRoutes.root]} />
        <H1>{title}</H1>
      </MainHeader>
      <MainContent>
        <PartyForm
          electionId={electionId}
          partyId={partyId as PartyId}
          savedElection={election}
        />
      </MainContent>
    </React.Fragment>
  );
}

export function ContestsScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const contestParamRoutes = electionParamRoutes.contests;
  const contestRoutes = routes.election(electionId).contests;
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
            <TabBar
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
