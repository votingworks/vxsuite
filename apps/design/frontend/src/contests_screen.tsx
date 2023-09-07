import React, { useState } from 'react';
import {
  Select,
  Button,
  Icons,
  Table,
  TH,
  TD,
  H1,
  LinkButton,
  P,
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
  DistrictId,
  Election,
  Id,
  Party,
  PartyId,
  YesNoContest,
} from '@votingworks/types';
import { assert, find } from '@votingworks/basics';
import {
  Breadcrumbs,
  Form,
  FormActionsRow,
  FormField,
  Input,
  TableActionsRow,
} from './layout';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import { TabPanel, TabBar } from './tabs';
import { getElection, updateElection } from './api';
import { SegmentedControl } from './segmented_control';

const FILTER_ALL = 'all';
const FILTER_NONPARTISAN = 'nonpartisan';

function ContestsTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);
  const [filterDistrictId, setFilterDistrictId] = useState(FILTER_ALL);
  const [filterPartyId, setFilterPartyId] = useState(FILTER_ALL);

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

  const districtIdToName = Object.fromEntries(
    districts.map((district) => [district.id, district.name])
  );
  const partyIdToName = Object.fromEntries(
    parties.map((party) => [party.id, party.name])
  );

  return (
    <TabPanel>
      {contests.length === 0 && (
        <P>You haven&apos;t added any contests to this election yet.</P>
      )}
      <TableActionsRow>
        {contests.length > 0 && (
          <React.Fragment>
            <Select
              value={filterDistrictId}
              onChange={(e) => setFilterDistrictId(e.target.value)}
            >
              <option value="all">All Districts</option>
              {districts.map((district) => (
                <option key={district.id} value={district.id}>
                  {district.name}
                </option>
              ))}
            </Select>
            {election.type === 'primary' && (
              <Select
                value={filterPartyId}
                onChange={(e) => setFilterPartyId(e.target.value)}
              >
                <option value="all">All Parties</option>
                <option value="nonpartisan">Nonpartisan</option>
                {parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
              </Select>
            )}
          </React.Fragment>
        )}
        <LinkButton variant="primary" to={contestRoutes.addContest.path}>
          <Icons.Add /> Add Contest
        </LinkButton>
      </TableActionsRow>
      {contests.length > 0 &&
        (filteredContests.length === 0 ? (
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
          <Table>
            <thead>
              <tr>
                <TH>Title</TH>
                <TH>ID</TH>
                <TH>District</TH>
                {election.type === 'primary' && <TH>Party</TH>}
                <TH />
              </tr>
            </thead>
            <tbody>
              {filteredContests.map((contest) => (
                <tr key={contest.id}>
                  <TD>{contest.title}</TD>
                  <TD>{contest.id}</TD>
                  <TD nowrap>{districtIdToName[contest.districtId]}</TD>
                  {election.type === 'primary' && (
                    <TD nowrap>
                      {contest.type === 'candidate' &&
                        contest.partyId !== undefined &&
                        partyIdToName[contest.partyId]}
                    </TD>
                  )}
                  <TD nowrap>
                    <LinkButton to={contestRoutes.editContest(contest.id).path}>
                      <Icons.Edit /> Edit
                    </LinkButton>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        ))}
    </TabPanel>
  );
}

function createBlankCandidateContest(id: ContestId): CandidateContest {
  return {
    id,
    type: 'candidate',
    districtId: '' as DistrictId,
    title: '',
    seats: 1,
    allowWriteIns: true,
    candidates: [],
  };
}

function createBlankYesNoContest(id: ContestId): YesNoContest {
  return {
    id,
    type: 'yesno',
    districtId: '' as DistrictId,
    title: '',
    description: '',
    yesOption: {
      id: `${id}-option-yes`,
      label: 'Yes',
    },
    noOption: {
      id: `${id}-option-no`,
      label: 'No',
    },
  };
}

function createBlankCandidate(id: Id): Candidate {
  return {
    id,
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
}): JSX.Element {
  const savedContests = savedElection.contests;
  const savedContest = contestId
    ? find(savedContests, (c) => c.id === contestId)
    : createBlankCandidateContest(`contest-${savedContests.length + 1}`);
  const [contest, setContest] = useState<AnyContest>(savedContest);
  const updateElectionMutation = updateElection.useMutation();
  const history = useHistory();
  const contestRoutes = routes.election(electionId).contests;

  function onSavePress() {
    const newContests = contestId
      ? savedContests.map((c) => (c.id === contestId ? contest : c))
      : [...savedContests, contest];
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

  function onDeletePress() {
    assert(contestId !== undefined);
    const newContests = savedContests.filter((c) => c.id !== contestId);
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
      <FormField label="Title">
        <Input
          type="text"
          value={contest.title}
          onChange={(e) => setContest({ ...contest, title: e.target.value })}
        />
      </FormField>
      <FormField label="ID">
        <Input
          type="text"
          value={contest.id}
          onChange={(e) => setContest({ ...contest, id: e.target.value })}
        />
      </FormField>
      <FormField label="District">
        <Select
          value={contest.districtId}
          onChange={(e) =>
            setContest({ ...contest, districtId: e.target.value as DistrictId })
          }
        >
          <option value="" />
          {savedElection.districts.map((district) => (
            <option key={district.id} value={district.id}>
              {district.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Type">
        <SegmentedControl
          options={[
            { value: 'candidate', label: 'Candidate Contest' },
            { value: 'yesno', label: 'Ballot Measure' },
          ]}
          value={contest.type}
          onChange={(type) =>
            setContest({
              ...(type === 'candidate'
                ? createBlankCandidateContest(contest.id)
                : createBlankYesNoContest(contest.id)),
              title: contest.title,
              districtId: contest.districtId,
            })
          }
        />
      </FormField>

      {contest.type === 'candidate' && (
        <React.Fragment>
          {savedElection.type === 'primary' && (
            <FormField label="Party">
              <Select
                value={contest.partyId ?? ''}
                onChange={(e) =>
                  setContest({
                    ...contest,
                    partyId: e.target.value
                      ? (e.target.value as PartyId)
                      : undefined,
                  })
                }
              >
                <option value="">No Party Affiliation</option>
                {savedElection.parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label="Seats">
            <Input
              type="number"
              value={contest.seats}
              onChange={(e) =>
                setContest({ ...contest, seats: e.target.valueAsNumber })
              }
              min={1}
            />
          </FormField>
          <FormField label="Term">
            <Input
              type="text"
              value={contest.termDescription}
              onChange={(e) =>
                setContest({ ...contest, termDescription: e.target.value })
              }
            />
          </FormField>
          <FormField label="Write-Ins Allowed?">
            <SegmentedControl
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              value={contest.allowWriteIns ? 'yes' : 'no'}
              onChange={(value) =>
                setContest({ ...contest, allowWriteIns: value === 'yes' })
              }
            />
          </FormField>
          <FormField label="Candidates">
            {contest.candidates.length === 0 && (
              <P style={{ marginTop: '0.5rem' }}>
                You haven&apos;t added any candidates to this contest yet.
              </P>
            )}
            <TableActionsRow>
              <Button
                onPress={() =>
                  setContest({
                    ...contest,
                    candidates: [
                      ...contest.candidates,
                      createBlankCandidate(
                        `candidate-${contest.candidates.length + 1}`
                      ),
                    ],
                  })
                }
              >
                <Icons.Add /> Add Candidate
              </Button>
            </TableActionsRow>
            {contest.candidates.length > 0 && (
              <Table>
                <thead>
                  <tr>
                    <TH>Name</TH>
                    <TH>ID</TH>
                    <TH>Party</TH>
                    <TH />
                  </tr>
                </thead>
                <tbody>
                  {contest.candidates.map((candidate, index) => (
                    // Because we want to be able to edit the ID, we can't use it as a key
                    // eslint-disable-next-line react/no-array-index-key
                    <tr key={`candidate-${index}`}>
                      <TD>
                        <Input
                          type="text"
                          value={candidate.name}
                          autoFocus
                          onChange={(e) =>
                            setContest({
                              ...contest,
                              candidates: contest.candidates.map((c) =>
                                c.id === candidate.id
                                  ? { ...candidate, name: e.target.value }
                                  : c
                              ),
                            })
                          }
                        />
                      </TD>
                      <TD>
                        <Input
                          type="text"
                          value={candidate.id}
                          onChange={(e) =>
                            setContest({
                              ...contest,
                              candidates: contest.candidates.map((c) =>
                                c.id === candidate.id
                                  ? { ...candidate, id: e.target.value }
                                  : c
                              ),
                            })
                          }
                        />
                      </TD>
                      <TD>
                        <Select
                          // Only support one party per candidate for now
                          value={candidate.partyIds?.[0] ?? ('' as PartyId)}
                          onChange={(e) =>
                            setContest({
                              ...contest,
                              candidates: contest.candidates.map((c) =>
                                c.id === candidate.id
                                  ? {
                                      ...candidate,
                                      partyIds: e.target.value
                                        ? [e.target.value as PartyId]
                                        : undefined,
                                    }
                                  : c
                              ),
                            })
                          }
                        >
                          <option value="">No Party Affiliation</option>
                          {savedElection.parties.map((party) => (
                            <option key={party.id} value={party.id}>
                              {party.name}
                            </option>
                          ))}
                        </Select>
                      </TD>
                      <TD>
                        <Button
                          onPress={() =>
                            setContest({
                              ...contest,
                              candidates: contest.candidates.filter(
                                (c) => c.id !== candidate.id
                              ),
                            })
                          }
                        >
                          <Icons.DangerX /> Remove Candidate
                        </Button>
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </FormField>
        </React.Fragment>
      )}

      {contest.type === 'yesno' && (
        <FormField label="Description">
          <textarea
            style={{ width: '100%', height: '10rem' }}
            value={contest.description}
            onChange={(e) =>
              setContest({ ...contest, description: e.target.value })
            }
          />
        </FormField>
      )}

      <div>
        <FormActionsRow>
          <LinkButton to={contestRoutes.root.path}>Cancel</LinkButton>
          <Button
            onPress={onSavePress}
            variant="primary"
            disabled={updateElectionMutation.isLoading}
          >
            <Icons.Checkmark /> Save
          </Button>
        </FormActionsRow>
        {contestId && (
          <FormActionsRow style={{ marginTop: '1rem' }}>
            <Button variant="danger" onPress={onDeletePress}>
              <Icons.DangerX /> Delete Contest
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

  return (
    <React.Fragment>
      <Breadcrumbs
        routes={[
          contestRoutes.contests.root,
          contestRoutes.contests.addContest,
        ]}
      />
      <H1>Add Contest</H1>
      <ContestForm electionId={electionId} savedElection={election} />
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

  return (
    <React.Fragment>
      <Breadcrumbs
        routes={[
          contestRoutes.contests.root,
          contestRoutes.contests.editContest(contestId),
        ]}
      />
      <H1>Edit Contest</H1>
      <ContestForm
        electionId={electionId}
        contestId={contestId}
        savedElection={election}
      />
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
        <LinkButton variant="primary" to={partyRoutes.addParty.path}>
          <Icons.Add /> Add Party
        </LinkButton>
      </TableActionsRow>
      {parties.length > 0 && (
        <Table>
          <thead>
            <tr>
              <TH>Name</TH>
              <TH>ID</TH>
              <TH>Abbreviation</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {parties.map((party) => (
              <tr key={party.id}>
                <TD>{party.fullName}</TD>
                <TD>{party.id}</TD>
                <TD>{party.abbrev}</TD>
                <TD>
                  <LinkButton to={partyRoutes.editParty(party.id).path}>
                    <Icons.Edit /> Edit
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

function createBlankParty(id: string): Party {
  return {
    id: id as PartyId,
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
  const savedParty = partyId
    ? find(savedParties, (p) => p.id === partyId)
    : createBlankParty(`party-${savedParties.length + 1}`);
  const [party, setParty] = useState<Party>(savedParty);
  const updateElectionMutation = updateElection.useMutation();
  const history = useHistory();
  const partyRoutes = routes.election(electionId).contests.parties;

  function onSavePress() {
    const newParties = partyId
      ? savedParties.map((p) => (p.id === partyId ? party : p))
      : [...savedParties, party];
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

  function onDeletePress() {
    assert(partyId !== undefined);
    const newParties = savedParties.filter((p) => p.id !== partyId);
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
      <FormField label="Full Name">
        <Input
          type="text"
          value={party.fullName}
          onChange={(e) => setParty({ ...party, fullName: e.target.value })}
        />
      </FormField>
      <FormField label="ID">
        <Input
          type="text"
          value={party.id}
          onChange={(e) =>
            setParty({ ...party, id: e.target.value as PartyId })
          }
        />
      </FormField>
      <FormField label="Short Name">
        <Input
          type="text"
          value={party.name}
          onChange={(e) => setParty({ ...party, name: e.target.value })}
        />
      </FormField>
      <FormField label="Abbreviation">
        <Input
          type="text"
          value={party.abbrev}
          onChange={(e) => setParty({ ...party, abbrev: e.target.value })}
        />
      </FormField>
      <div>
        <FormActionsRow>
          <LinkButton to={partyRoutes.root.path}>Cancel</LinkButton>
          <Button
            onPress={onSavePress}
            variant="primary"
            disabled={updateElectionMutation.isLoading}
          >
            <Icons.Checkmark /> Save
          </Button>
        </FormActionsRow>
        {partyId && (
          <FormActionsRow style={{ marginTop: '1rem' }}>
            <Button variant="danger" onPress={onDeletePress}>
              <Icons.DangerX /> Delete Party
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

  return (
    <React.Fragment>
      <Breadcrumbs routes={[partyRoutes.root, partyRoutes.addParty]} />
      <H1>Add Party</H1>
      <PartyForm electionId={electionId} savedElection={election} />
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

  return (
    <React.Fragment>
      <Breadcrumbs
        routes={[partyRoutes.root, partyRoutes.editParty(partyId)]}
      />
      <H1>Edit Party</H1>
      <PartyForm
        electionId={electionId}
        partyId={partyId as PartyId}
        savedElection={election}
      />
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
          <H1>Contests</H1>
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
        </Route>
      </Switch>
    </ElectionNavScreen>
  );
}
