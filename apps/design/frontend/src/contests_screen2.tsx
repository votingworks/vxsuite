import React, { useState } from 'react';
import {
  Button,
  Table,
  TH,
  TD,
  LinkButton,
  P,
  SegmentedButton,
  SearchSelect,
  Modal,
  H1,
  Callout,
  Caption,
  Font,
  DesktopPalette,
  H2,
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
  ElectionStringKey,
  PartyId,
  safeParse,
  YesNoContestSchema,
} from '@votingworks/types';
import { Result, throwIllegalValue } from '@votingworks/basics';
import styled, { css } from 'styled-components';
import { Flipper, Flipped } from 'react-flip-toolkit';
import { z } from 'zod/v4';
import { TtsStringDefault } from '@votingworks/design-backend';
import { FieldName, Form, FormActionsRow, InputGroup, Row } from './layout';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import {
  createContest,
  deleteContest,
  getBallotsFinalizedAt,
  getElectionInfo,
  listContests,
  listDistricts,
  listParties,
  reorderContests,
  updateContest,
} from './api';
import { generateId, reorderElement, replaceAtIndex } from './utils';
import { useTitle } from './hooks/use_title';
import { InputWithAudio } from './ballot_audio/input_with_audio';
import { Tooltip, TooltipContainer } from './tooltip';
import { RichTextEditorWithAudio } from './ballot_audio/rich_text_editor_with_audio';
import { BallotAudioPathParams } from './ballot_audio/routes';
import * as api from './api';
import { StringInfo } from './ballot_audio/string_info';
import { StringPanel } from './ballot_audio/elements';
import { EditPanel as AudioEditPanel } from './ballot_audio/edit_panel';
import { cssStyledScrollbars } from './scrollbars';
import { FixedViewport } from './edit_screen_elements';

export function ContestsScreen2(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const contestParamRoutes = electionParamRoutes.contests2;
  useTitle(routes.election(electionId).contests.root.title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>Contests</H1>
      </Header>
      <FixedViewport>
        <Switch>
          <Route
            path={contestParamRoutes.view(':contestId').path}
            component={ContestsTab2}
          />
          <Route
            path={
              contestParamRoutes.audio.manage(
                ':contestId',
                ':ttsMode',
                ':stringKey',
                ':subkey'
              ).path
            }
            exact
            component={ContestsTab2}
          />
          <Route path={contestParamRoutes.root.path} component={ContestsTab2} />
          <Redirect to={contestParamRoutes.root.path} />
        </Switch>
      </FixedViewport>
    </ElectionNavScreen>
  );
}

const FILTER_ALL = 'all';
const FILTER_NONPARTISAN = 'nonpartisan';

const ReorderButton = styled(Button)`
  padding: 0.6rem;
`;

const EditButton = styled(LinkButton)`
  /* padding: 0.6rem; */
  background: ${(p) => p.theme.colors.background};
`;

const EditButtonContainer = styled(TooltipContainer)``;

const ContestListItem = styled.div`
  align-items: center;
  border: 0;
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem dashed #aaa;
  border-radius: 0;
  /* color: unset; */
  cursor: pointer;
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  text-decoration: none;
  transition-duration: 100ms;
  transition-property: background, border, box-shadow, color;
  transition-timing-function: ease-out;
  position: relative;

  ${EditButtonContainer} {
    display: none;
    position: absolute;
    right: 1rem;
  }

  :focus,
  :hover {
    background: ${(p) => p.theme.colors.containerLow};
    box-shadow: inset 0.2rem 0px 0 ${DesktopPalette.Purple50};
    color: inherit;
    outline: none;

    ${EditButtonContainer} {
      /* display: initial; */
    }
  }

  :active,
  &[aria-selected='true'] {
    background-color: ${DesktopPalette.Purple10};
    /* background-color: ${(p) => p.theme.colors.background} !important; */
    box-shadow: inset 0.35rem 0 0 ${DesktopPalette.Purple60};
    /* color: inherit; */
  }
`;

const ContestListItems = styled.div`
  box-shadow: inset 0 0 0 ${DesktopPalette.Purple50};
  display: flex;
  flex-direction: column;
`;

const ListActionsRow = styled(Row)`
  background: ${(p) => p.theme.colors.background};
  /* box-shadow: 0 0.1rem 0.2rem 0.05rem rgba(0, 0, 0, 25%); */
  border-bottom: 1px solid #aaa;
  gap: 0.5rem;
  grid-area: actions;
  height: min-content;
  padding: 0.5rem 1rem;
  z-index: 1;
`;

const cssTabPanelExpanded = css`
  grid-template-areas:
    'actions actions'
    'contests editor';

  /*
   * Last tuned for a candidate contest to make good use of a viewport size of
   * ~1920px.
  */
  grid-template-columns: minmax(10rem, min(25%, 21rem)) 1fr;
  grid-template-rows: min-content 1fr;
`;

const TabPanel = styled.section`
  display: grid;
  padding: 0;
  grid-gap: 0;
  grid-template-rows: min-content auto;
  grid-template-areas:
    'actions'
    'contests';
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;

  ${cssTabPanelExpanded}

  .icon-button {
    background: ${(p) => p.theme.colors.background};
    border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
    padding: 0.6rem 0.75rem;
  }
`;

const ContestLists = styled.div`
  display: flex;
  flex-direction: column;
  /* gap: 1rem; */
  grid-area: contests;
  height: 100%;
  overflow-y: auto;
  position: relative;
  /* padding: 1rem 0.125rem 1rem 1rem; */
  padding-right: 0.125rem;

  h2,
  h3 {
    background-color: ${(p) => p.theme.colors.containerLow};
    border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid #aaa;
    border-right: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid #aaa;
    /* border-top-left-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
    border-top-right-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem; */
    padding: 0.75rem 1rem;
    margin: 0;
    /* position: sticky; */
    font-weight: 600;
    top: 0;
    position: sticky;
    z-index: 1;

    :not(:first-child) {
      border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid #aaa;
      /* border-top: ${(p) =>
        p.theme.sizes.bordersRem.hairline}rem solid #aaa; */
      margin: 0;
      top: -${(p) => p.theme.sizes.bordersRem.hairline}rem;
    }
  }

  > :last-child {
    flex-grow: 1;
  }

  ${cssStyledScrollbars}
`;

const ContestList = styled.div`
  border-right: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid #aaa;
  position: relative;
  min-height: max-content;

  :not(:last-child) {
    ${ContestListItem}:last-child {
      border-bottom: none;
    }
  }

  :last-child {
    padding-bottom: 1rem;
  }
`;

const EditPanel = styled.div`
  grid-area: editor;
  height: 100%;
  /* max-width: 60rem; */
  overflow: hidden;

  /* > * {
    max-width: 60rem;
  } */
`;

const InputGroupGroup = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
`;

const NameInputTable = styled(Table)`
  max-width: 70rem;
  width: 100%;

  td,
  th {
    border: 0;
    padding: 0.35rem 0.35rem;

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
    border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem dashed #aaa;
    padding-top: 0;
  }

  td {
    /* border-top: ${(p) =>
      p.theme.sizes.bordersRem.hairline}rem dashed #aaa; */
  }

  tr {
    transition-property: background;
    transition-duration: 100ms;
    transition-timing-function: linear;

    :focus-within,
    :hover {
      /* box-shadow: -0.25rem 0 0 ${DesktopPalette.Purple50}; */

      td {
        background: ${(p) => p.theme.colors.containerLow};
        background: ${DesktopPalette.Purple10};
      }
    }
  }
`;

const NameInputRow = styled.tr`
  .search-select,
  input[type='text'] {
    min-width: 5.5rem;
    width: 100%;
  }

  /* .name-input-row-button {
    border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
  } */
`;

export function ContestsTab2(): JSX.Element | null {
  const { electionId, contestId } = useParams<
    ElectionIdParams & { contestId?: string }
  >();
  const listContestsQuery = listContests.useQuery(electionId);
  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const listPartiesQuery = listParties.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const reorderContestsMutation = reorderContests.useMutation();
  const [filterDistrictId, setFilterDistrictId] = useState(FILTER_ALL);
  const [filterPartyId, setFilterPartyId] = useState(FILTER_ALL);
  const [reorderedContests, setReorderedContests] = useState<Contests>();
  const history = useHistory();
  const selectedContestRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (contestId || !listContestsQuery.isSuccess) return;

    const contests = listContestsQuery.data;
    const contestRoutes = routes.election(electionId).contests2;

    history.replace(contestRoutes.view(contests[0].id).path);
  }, [contestId, electionId, history, listContestsQuery]);

  React.useLayoutEffect(() => {
    if (!selectedContestRef.current) return;
    selectedContestRef.current.scrollIntoView({ block: 'nearest' });
  }, [contestId]);

  const districtIdToName = React.useMemo(() => {
    const districts = listDistrictsQuery.data;
    return districts
      ? new Map(districts.map((district) => [district.id, district.name]))
      : new Map();
  }, [listDistrictsQuery.data]);

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
  const contestRoutes = routes.election(electionId).contests2;

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
  const contestsToShowByType = contestsToShow.reduce((map, contest) => {
    const existing = map.get(contest.type) || [];
    map.set(contest.type, [...existing, contest]);
    return map;
  }, new Map<string, AnyContest[]>());

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

  function onContestClick(e: React.MouseEvent) {
    const containerTarget = e.currentTarget;
    const actualTarget = e.target;
    if (
      !(containerTarget instanceof HTMLElement) ||
      actualTarget instanceof HTMLButtonElement // Ignore child button clicks.
    ) {
      return;
    }

    const href = containerTarget.getAttribute('data-href');
    if (!href) return;

    history.push(href);
  }

  const contestParamRoutes = electionParamRoutes.contests2;

  return (
    <TabPanel>
      <ListActionsRow>
        {!ballotsFinalizedAt && (
          <LinkButton
            variant="primary"
            icon="Add"
            to={contestRoutes.add.path}
            disabled={isReordering || !!ballotsFinalizedAt}
          >
            Add Contest
          </LinkButton>
        )}
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
        {!ballotsFinalizedAt && (
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
                icon="SortUpDown"
                onPress={() =>
                  // We require candidate contests to appear before yesno,
                  // but elections were created prior to this restriction.
                  // To ensure all new reorders follow this, we initiate
                  // the reordering with the requirement enforced
                  setReorderedContests(
                    [...contests].sort((a, b) => {
                      // Candidate contests come before ballot measures (yesno)
                      if (a.type === 'candidate' && b.type === 'yesno') {
                        return -1;
                      }
                      if (a.type === 'yesno' && b.type === 'candidate') {
                        return 1;
                      }
                      return 0; // Same type, maintain relative order
                    })
                  )
                }
                disabled={!canReorder}
              >
                Reorder Contests
              </Button>
            )}
          </div>
        )}
      </ListActionsRow>
      <ContestLists>
        {contests.length === 0 && (
          <P>You haven&apos;t added any contests to this election yet.</P>
        )}
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
            <React.Fragment>
              {[...contestsToShowByType]
                .sort(([a]) => (a === 'candidate' ? -1 : 1)) // Candidate table first
                .map(([contestType, contestsOfType]) => (
                  <React.Fragment key={contestType}>
                    <H2>
                      {contestType === 'candidate'
                        ? 'Candidate Contests'
                        : 'Ballot Measures'}
                    </H2>
                    <ContestList>
                      {/* Flipper/Flip are used to animate the reordering of contest rows */}
                      {/* @ts-expect-error: TS doesn't think Flipper is a valid component */}
                      <Flipper
                        flipKey={contestsOfType
                          .map((contest) => contest.id)
                          .join(',')}
                        // Custom spring parameters to speed up the duration of the animation
                        // See https://github.com/aholachek/react-flip-toolkit/issues/100#issuecomment-551056183
                        spring={{ stiffness: 439, damping: 42 }}
                      >
                        <ContestListItems>
                          {contestsOfType.map((contest, index) => {
                            const indexInFullList = contestsToShow.findIndex(
                              (c) => c.id === contest.id
                            );
                            return (
                              <Flipped
                                key={contest.id}
                                flipId={contest.id}
                                shouldFlip={() => isReordering}
                              >
                                <ContestListItem
                                  key={contest.id}
                                  aria-selected={contestId === contest.id}
                                  data-href={
                                    contestRoutes.view(contest.id).path
                                  }
                                  onClick={onContestClick}
                                  ref={
                                    contestId === contest.id
                                      ? selectedContestRef
                                      : undefined
                                  }
                                >
                                  {/* <div>
                                <Font style={{ color: '#666' }} weight="bold">
                                  {districtIdToName.get(contest.districtId)}
                                </Font>
                              </div> */}
                                  <div style={{ flexGrow: 1 }}>
                                    {
                                      <div>
                                        <Caption
                                          style={{
                                            color: '#333',
                                            // whiteSpace: 'nowrap',
                                            // textOverflow: 'ellipsis',
                                          }}
                                          weight="regular"
                                        >
                                          {districtIdToName.get(
                                            contest.districtId
                                          )}
                                        </Caption>
                                      </div>
                                    }
                                    <div>
                                      <Font
                                        weight={
                                          contestId === contest.id
                                            ? 'bold'
                                            : 'regular'
                                        }
                                      >
                                        {contest.title}
                                      </Font>
                                      {/* contest.type === 'candidate' &&
                                      contest.partyId !== undefined && (
                                        <div>
                                          <Caption
                                            style={{
                                              color: '#333',
                                              // whiteSpace: 'nowrap',
                                              // textOverflow: 'ellipsis',
                                            }}
                                            weight="regular"
                                          >
                                            {partyIdToName.get(contest.partyId)}
                                          </Caption>
                                        </div>
                                      ) */}
                                    </div>
                                  </div>
                                  {isReordering ? (
                                    <Row
                                      style={{
                                        gap: '0.5rem',
                                        justifyContent: 'flex-end',
                                      }}
                                    >
                                      <ReorderButton
                                        aria-label="Move Up"
                                        icon="ChevronUp"
                                        disabled={index === 0}
                                        disableEventPropagation
                                        // fill="transparent"
                                        onPress={() =>
                                          setReorderedContests(
                                            reorderElement(
                                              reorderedContests,
                                              indexInFullList,
                                              indexInFullList - 1
                                            )
                                          )
                                        }
                                      />
                                      <ReorderButton
                                        aria-label="Move Down"
                                        icon="ChevronDown"
                                        disabled={
                                          index === contestsOfType.length - 1
                                        }
                                        disableEventPropagation
                                        // fill="transparent"
                                        onPress={() =>
                                          setReorderedContests(
                                            reorderElement(
                                              reorderedContests,
                                              indexInFullList,
                                              indexInFullList + 1
                                            )
                                          )
                                        }
                                      />
                                    </Row>
                                  ) : 'a'.length < 5 ? (
                                    <EditButtonContainer>
                                      <EditButton
                                        className="icon-button"
                                        fill="transparent"
                                        disableEventPropagation
                                        icon="Edit"
                                        to={contestRoutes.edit(contest.id).path}
                                        variant="primary"
                                      >
                                        Edit
                                      </EditButton>
                                    </EditButtonContainer>
                                  ) : (
                                    <EditButtonContainer>
                                      <EditButton
                                        className="icon-button"
                                        fill="transparent"
                                        disableEventPropagation
                                        icon="Edit"
                                        to={contestRoutes.edit(contest.id).path}
                                        variant="primary"
                                      />
                                      <Tooltip alignTo="right">
                                        Edit Contest
                                      </Tooltip>
                                    </EditButtonContainer>
                                  )}
                                </ContestListItem>
                              </Flipped>
                            );
                          })}
                        </ContestListItems>
                      </Flipper>
                    </ContestList>
                  </React.Fragment>
                ))}
            </React.Fragment>
          ))}
      </ContestLists>
      <EditPanel>
        <Switch>
          <Route
            path={
              contestParamRoutes.audio.manage(
                ':contestId',
                ':ttsMode',
                ':stringKey',
                ':subkey'
              ).path
            }
            exact
            component={AudioPanel}
          />
          <Route
            path={contestParamRoutes.view(':contestId').path}
            component={EditContestForm}
          />
        </Switch>
      </EditPanel>
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

const AudioPanelContainer = styled.div`
  height: 100%;
  padding: 1rem;
  position: relative;
  overflow-y: auto;

  ${cssStyledScrollbars}
`;

const AudioPanelHeader = styled.div`
  background: ${(p) => p.theme.colors.background};
  display: flex;
  height: min-content;
  margin-bottom: 0.3rem;

  button {
    font-size: 0.8rem;
    gap: 0.25rem;
    padding: 0;

    &:active,
    &:focus,
    &:hover {
      background: none !important;
    }
  }
`;

function AudioPanel(): React.ReactNode {
  const { contestId, electionId, stringKey, subkey } = useParams<
    BallotAudioPathParams & { contestId: string }
  >();
  const contestRoutes = routes.election(electionId).contests2;

  const stringDefaults = api.ttsStringDefaults.useQuery(electionId).data;
  const currentString = React.useMemo(() => {
    if (!stringKey || !stringDefaults) return undefined;

    for (const appString of stringDefaults) {
      if (appString.key !== stringKey || appString.subkey !== subkey) continue;

      return appString;
    }
  }, [stringDefaults, stringKey, subkey]);

  if (!stringDefaults || !currentString) return null;

  return (
    <AudioPanelContainer>
      <AudioPanelHeader>
        <LinkButton
          icon="Previous"
          fill="transparent"
          variant="primary"
          to={contestRoutes.view(contestId).path}
        >
          Contest Info
        </LinkButton>
      </AudioPanelHeader>
      <H2 style={{ margin: '0 0 0.5rem' }}>Contest Audio</H2>
      <StringPanel>
        <StringInfo
          mini
          stringKey={currentString.key}
          subkey={currentString.subkey}
          text={currentString.text}
        />
        <AudioEditPanel
          key={joinStringKey(currentString)}
          str={currentString}
        />
      </StringPanel>
    </AudioPanelContainer>
  );
}

function joinStringKey(info: TtsStringDefault) {
  if (!info.subkey) return info.key;

  return `${info.key}.${info.subkey}`;
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

const ContestFormEl = styled(Form)`
  gap: 0;
  max-height: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;

  input:disabled {
    cursor: not-allowed;
  }

  &[data-editing='false'] {
    input,
    .search-select > div {
      background-color: ${(p) => p.theme.colors.background};
      /* font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold}; */
      color: ${(p) => p.theme.colors.onBackground};
    }
  }
`;

const ContestFormHeader = styled(H2)`
  /*
   * Offset the vertical flex gap a bit to keep this visually attached to the
   * rest of the form body.
   */
  margin-bottom: -0.5rem;
  padding: 0;
`;

const ContestFormBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  height: 100%;
  overflow: auto;
  padding: 1rem 0.75rem 1rem 0.875rem;
  margin-right: 0.25rem;

  ${cssStyledScrollbars}

  > * {
    /* max-width: 75ch; */
  }

  /* ${FieldName} {
    margin-bottom: 0.25rem;
  } */
`;

const ContestFormFooter = styled.div`
  /* box-shadow: 0 -0.75rem 0.5rem ${(p) => p.theme.colors.background}; */
  bottom: 0;
  border-top: 1px dashed #aaa;
  border-top: 1px solid #aaa;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: space-between;
  /* max-width: 72rem; */
  margin: 0 1rem 0 0.875rem;
  padding: 1rem 0;
  position: sticky;
`;

function ContestForm({
  editing,
  electionId,
  savedContest,
}: {
  editing?: boolean;
  electionId: ElectionId;
  savedContest?: AnyContest;
}): React.ReactNode {
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
  const contestRoutes = routes.election(electionId).contests2;
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
    history.push(contestRoutes.root.path);
  }

  function setIsEditing(newState: boolean) {
    if (!savedContest) return history.replace(contestRoutes.root.path);

    if (newState) {
      history.replace(contestRoutes.edit(savedContest.id).path);
    } else {
      history.replace(contestRoutes.view(savedContest.id).path);
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
            if (result.isOk()) setIsEditing(false);
          },
        }
      );
    } else {
      createContestMutation.mutate(
        { electionId, newContest: formContest },
        {
          onSuccess: (result) => {
            if (result.isOk()) setIsEditing(false);
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
    <ContestFormEl
      data-editing={editing ? 'true' : 'false'}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onReset={(e) => {
        e.preventDefault();
        setContest(
          savedContest
            ? draftContestFromContest(savedContest)
            : // To make mocked IDs predictable in tests, we pass a function here
              // so it will only be called on initial render.
              createBlankCandidateContest
        );
        setIsEditing(!editing);
      }}
    >
      <ContestFormBody>
        <ContestFormHeader>Contest Info</ContestFormHeader>
        <InputGroup label="Title">
          <InputWithAudio
            editing={editing}
            disabled={disabled}
            href={
              contestRoutes.audio.manage(
                contest.id,
                'text',
                ElectionStringKey.CONTEST_TITLE,
                contest.id
              ).path
            }
            tooltipPlacement="bottom"
            type="text"
            value={contest.title}
            onChange={(e) => setContest({ ...contest, title: e.target.value })}
            onBlur={(e) =>
              setContest({ ...contest, title: e.target.value.trim() })
            }
            autoComplete="off"
            required
            style={{ maxWidth: '20rem' }}
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
        <InputGroupGroup>
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
        </InputGroupGroup>

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
            <InputGroupGroup>
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
                  editing={editing}
                  disabled={disabled}
                  href={
                    contestRoutes.audio.manage(
                      contest.id,
                      'text',
                      ElectionStringKey.CONTEST_TERM,
                      contest.id
                    ).path
                  }
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
            </InputGroupGroup>
            <div>
              <FieldName>Candidates</FieldName>
              {contest.candidates.length === 0 && (
                <P style={{ marginTop: '0.5rem' }}>
                  You haven&apos;t added any candidates to this contest yet.
                </P>
              )}
              {contest.candidates.length > 0 && (
                <NameInputTable>
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
                      <NameInputRow key={candidate.id}>
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
                          {editing ? (
                            <TooltipContainer
                              as="div"
                              style={{ width: 'min-content' }}
                            >
                              <Button
                                className="name-input-row-button icon-button"
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
                                {candidate.firstName}{' '}
                                {candidate.middleName
                                  ? `${candidate.middleName} `
                                  : ''}
                                {candidate.lastName}
                              </Tooltip>
                            </TooltipContainer>
                          ) : (
                            <TooltipContainer
                              as="div"
                              style={{ width: 'min-content' }}
                            >
                              <LinkButton
                                className="name-input-row-button icon-button"
                                icon="VolumeUp"
                                fill="transparent"
                                to={
                                  contestRoutes.audio.manage(
                                    contest.id,
                                    'text',
                                    ElectionStringKey.CANDIDATE_NAME,
                                    candidate.id
                                  ).path
                                }
                                variant="primary"
                              />
                              <Tooltip alignTo="right" bold>
                                Preview/Edit Audio
                                <br />
                                {candidate.firstName}{' '}
                                {candidate.middleName
                                  ? `${candidate.middleName} `
                                  : ''}
                                {candidate.lastName}
                              </Tooltip>
                            </TooltipContainer>
                          )}
                        </TD>
                      </NameInputRow>
                    ))}
                  </tbody>
                </NameInputTable>
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
              <RichTextEditorWithAudio
                disabled={disabled}
                href={
                  contestRoutes.audio.manage(
                    contest.id,
                    'text',
                    ElectionStringKey.CONTEST_DESCRIPTION,
                    contest.id
                  ).path
                }
                editing={editing}
                initialHtmlContent={contest.description}
                onChange={(htmlContent) =>
                  setContest({ ...contest, description: htmlContent })
                }
              />
            </div>

            <InputGroup label="First Option Label">
              <InputWithAudio
                editing={editing}
                disabled={disabled}
                href={
                  contestRoutes.audio.manage(
                    contest.id,
                    'text',
                    ElectionStringKey.CONTEST_OPTION_LABEL,
                    contest.yesOption.id
                  ).path
                }
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
                style={{ width: '20rem' }}
              />
            </InputGroup>

            <InputGroup label="Second Option Label">
              <InputWithAudio
                editing={editing}
                href={
                  contestRoutes.audio.manage(
                    contest.id,
                    'text',
                    ElectionStringKey.CONTEST_OPTION_LABEL,
                    contest.noOption.id
                  ).path
                }
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
                style={{ width: '20rem' }}
              />
            </InputGroup>
          </React.Fragment>
        )}
      </ContestFormBody>

      {!isFinalized && (
        <ContestFormFooter>
          {errorMessage}
          <PrimaryFormActions disabled={disabled} editing={editing} />
          {savedContest && (
            <FormActionsRow>
              <Button
                variant="danger"
                fill="outlined"
                icon="Delete"
                onPress={() => setIsConfirmingDelete(true)}
                disabled={someMutationIsLoading}
              >
                Delete Contest
              </Button>
            </FormActionsRow>
          )}
        </ContestFormFooter>
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
    </ContestFormEl>
  );
}

function PrimaryFormActions(props: { disabled?: boolean; editing?: boolean }) {
  const { disabled, editing } = props;

  if (!editing) {
    return (
      <FormActionsRow>
        <Button icon="Edit" type="reset" variant="primary">
          Edit
        </Button>
      </FormActionsRow>
    );
  }

  return (
    <FormActionsRow>
      <Button disabled={disabled} type="reset">
        Cancel
      </Button>
      <Button type="submit" variant="primary" icon="Done" disabled={disabled}>
        Save
      </Button>
    </FormActionsRow>
  );
}

// function AddContestForm(): JSX.Element | null {
//   const { electionId } = useParams<ElectionIdParams>();
//   const contestRoutes = routes.election(electionId).contests2;
//   const { title } = contestRoutes.add;

//   return (
//     <React.Fragment>
//       <Header>
//         <Breadcrumbs currentTitle={title} parentRoutes={[contestRoutes.root]} />
//         <H1>{title}</H1>
//       </Header>
//       <FixedViewport>
//         <ContestForm electionId={electionId} />
//       </FixedViewport>
//     </React.Fragment>
//   );
// }

function EditContestForm(): JSX.Element | null {
  const { electionId, contestId } = useParams<
    ElectionIdParams & { contestId: ContestId }
  >();
  const listContestsQuery = listContests.useQuery(electionId);
  const contestParamRoutes = electionParamRoutes.contests2;

  /* istanbul ignore next - @preserve */
  if (!listContestsQuery.isSuccess) {
    return null;
  }

  const contests = listContestsQuery.data;
  const savedContest = contests.find((c) => c.id === contestId);

  // If the contest was just deleted, this form may still render momentarily.
  // Ignore it.
  /* istanbul ignore next - @preserve */
  if (!savedContest) {
    return null;
  }

  // return (
  //   <ContestForm
  //     electionId={electionId}
  //     key={contestId}
  //     savedContest={savedContest}
  //   />
  // );

  return (
    <Switch>
      <Route path={contestParamRoutes.edit(':contestId').path} exact>
        <ContestForm
          electionId={electionId}
          key={contestId}
          editing
          savedContest={savedContest}
        />
      </Route>
      <Route path={contestParamRoutes.view(':contestId').path} exact>
        <ContestForm
          electionId={electionId}
          key={contestId}
          savedContest={savedContest}
        />
      </Route>
    </Switch>
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
