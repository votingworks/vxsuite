import React, { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import styled from 'styled-components';

import {
  AnyContest,
  Candidate as CandidateInterface,
  CandidateContest,
  CompressedTally,
  Dictionary,
  Election,
  CompressedTallyEntry,
  Tabulation,
  safeParseElection,
  YesNoContest,
} from '@votingworks/types';
import {
  format,
  getContestsForPrecinct,
  readCompressedTally,
} from '@votingworks/utils';
import { Button, RichText, Seal, UiRichTextString } from '@votingworks/ui';
import { ServerResult } from './config/types';
import pluralize from 'pluralize';
import { assert, DateWithoutTime } from '@votingworks/basics';

const NoWrap = styled.span`
  white-space: nowrap;
`;

const NavigationBanner = styled.div`
  background: ${(p) => p.theme.colors.primary};
`;
const Navigation = styled.div`
  display: flex;
  align-items: stretch;
`;
const NavigationContent = styled.div`
  display: flex;
  flex-direction: column;
`;
const Brand = styled.div`
  position: relative;
  width: 70px;
  height: 70px;
  margin: 0.5rem;
  @media (min-width: 568px) {
    width: 120px;
    height: 90px;
    padding: 1rem;
    margin: 0.5rem 1rem;
  }
  @media print, (min-width: ${1200 + 2 * 16}px) {
    margin-left: 0;
  }
`;
const SealContainer = styled.span`
  max-width: 100%;
  border-radius: 100%;
  box-shadow: 0 1px 4px #666666;
  @media (min-width: 568px) {
    position: absolute;
    top: 0;
    left: 0;
    width: 120px;
    height: 120px;
  }
`;
const NewResultsMessage = styled.div<{ showMessage: boolean }>`
  position: absolute;
  z-index: 1;
  top: 0;
  left: 0;
  display: flex;
  width: 70px;
  height: 70px;
  padding: 0.5rem;
  background-color: hsl(262, 53%, 77%);
  border-radius: 100%;
  font-size: 0.9em;
  font-weight: 700;
  opacity: ${({ showMessage }) => (showMessage ? '100%' : '0%')};
  text-align: center;
  transform: rotate(-14deg);
  transition: opacity linear
    ${({ showMessage }) => (showMessage ? '0.75s' : '2s')};
  @media (min-width: 568px) {
    width: 120px;
    height: 120px;
    font-size: 1.4em;
  }
  & > span {
    margin: auto;
  }
`;
const NavHeader = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  color: #ffffff;
  line-height: 1.25;
  @media print, (min-width: 568px) {
    font-size: 1.5rem;
  }
  @media print {
    color: #000000;
  }
`;

const ElectionDate = styled.p`
  margin-bottom: 1rem;
  font-size: 0.9rem;
  @media print, (min-width: 568px) {
    font-size: 1rem;
  }
`;
const NavTabs = styled.div`
  display: flex;
  flex-wrap: nowrap;
  @media print {
    display: none;
  }
`;
const NavTab = styled.button<{ active?: boolean }>`
  padding: 0.5rem 1rem;
  margin-right: 0.5rem;
  background: ${({ active }) => (active ? '#eeeeee' : '#003334')};
  border-radius: 0.3rem 0.3rem 0 0;
  color: ${({ active }) => (active ? '#000000' : '#ffffff')};
  font-size: 1.15rem;
  text-decoration: none;
`;
const Main = styled.div`
  display: flex;
  min-height: 100vh;
  overflow: visible;
`;
const MainChild = styled.div`
  margin: auto;
`;
const Container = styled.div`
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  padding: 0.5rem;
  line-height: 1.25;
  @media (min-width: 568px) {
    padding: 1.25rem 1rem 1rem;
  }
  @media print, (min-width: ${1200 + 2 * 16}px) {
    padding-right: 0;
    padding-left: 0;
  }
`;
const Headline = styled.h1`
  font-size: 2rem;
`;
const LastUpdated = styled.p`
  font-size: 0.9rem;
`;

const ElectionTitle = styled.h2`
  margin-top: 0.5rem;
  font-size: 1.5rem;
`;

const Actions = styled.div`
  display: none;
  float: right;
  @media (min-width: 768px) {
    display: block;
  }
`;

const Contests = styled.div`
  display: grid;
  margin-bottom: 1rem;
  grid-column-gap: 1rem;
  grid-row-gap: 1rem;
  grid-template-columns: repeat(1, 1fr);
  @media print {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (min-width: 568px) {
    margin-right: 1rem;
    margin-left: 1rem;
    grid-template-columns: repeat(2, 1fr);
  }
  @media (min-width: 768px) {
    grid-template-columns: repeat(3, 1fr);
  }
  @media (min-width: ${1200 + 2 * 16}px) {
    margin-right: 0;
    margin-left: 0;
  }
`;

const Contest = styled.div`
  flex: 1;
  padding: 1rem 1rem 0.75rem;
  background: #ffffff;
  box-shadow: 0 1px 4px #666666;
  @media (min-width: 568px) {
    border-radius: 0.3rem;
  }
  @media print {
    border: 1px solid #000000;
    box-shadow: none;
  }
`;
const ContestMeta = styled.div`
  padding-top: 0.5rem;
  border-top: 1px solid #999999;
  margin-top: 1rem;
  font-size: 0.9rem;
  text-align: center;
`;
const ContestSection = styled.div`
  font-size: 0.9rem;
`;
const ContestTitle = styled.h2`
  margin-top: 0.25rem;
  font-size: 1.5rem;
`;
const Row = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
`;

const Candidate = styled.div`
  position: relative;
  padding-top: 0.5rem;
  border-top: 1px solid #999999;
  margin-top: 1rem;
  &:first-child {
    margin-top: 0.5rem;
  }
`;

const CandidateProgressBar = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  & > div {
    height: 4px;
    background: hsl(262, 53%, 77%);
    @media print {
      background: #000000;
    }
  }
`;

const CandidateRow = styled(Row)`
  align-items: flex-start;
`;

const CandidateDataColumn = styled.div`
  line-height: 1.25;
  &:last-child {
    margin-left: 0.5rem;
    text-align: right;
  }
`;
const CandidateMain = styled.div`
  font-size: 1rem;
  font-weight: 700;
`;
const CandidateDetail = styled.div`
  font-size: 0.9rem;
  white-space: nowrap;
`;

const Refresh = styled.p`
  padding: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.9rem;
  line-height: 1.25;
  text-align: center;
  @media (min-width: 568px) {
    padding: 1.25rem 1rem 1rem;
  }
  @media (min-width: ${1200 + 2 * 16}px) {
    padding-right: 0;
    padding-left: 0;
  }
  @media print {
    display: none;
  }
`;

const formatPercentage = (a: number, b: number): string => {
  if (a === 0) {
    return '0%';
  }
  if (a === b) {
    return '100%';
  }
  const quotient = b === 0 ? 0 : a / b;
  return `${(Math.round(quotient * 10000) / 100).toFixed(2)}%`;
};

const sumCompressedTallies = (
  compressedTallies: CompressedTally[]
): CompressedTally =>
  compressedTallies.reduce(
    (sum, tally) =>
      sum.length === 0
        ? tally
        : sum.map(
            (contest, contestIndex) =>
              contest.map(
                (option, tallyIndex) => option + tally[contestIndex][tallyIndex]
              ) as CompressedTallyEntry
          ),
    [] as CompressedTally
  );

const getContestTallies = (tally: CompressedTally, election: Election) =>
  readCompressedTally(election, tally);

const getPartyName = (election: Election, partyId: string) =>
  election?.parties.find((p) => p.id === partyId)?.name;

const refreshInterval = 5;
const newResultsTimeout = 5;
const App: React.FC = () => {
  const electionHash = process.env.REACT_APP_VX_ELECTION_HASH;

  const deskBell = useRef<HTMLAudioElement>(null);
  const [election, setElection] = useState<Election | undefined>(undefined);
  const [tallies, setTallies] = useState<ServerResult[] | undefined>(undefined);
  const hasResults = !!tallies?.length;
  const [currentPage, setCurrentPage] = useState('results');
  const [newResults, setNewResults] = useState(false);
  const [isAudioNotification, setIsAudioNotification] = useState(false);
  const toggleIsAudioNotification = () => {
    setIsAudioNotification((on) => {
      const bell = deskBell.current;
      if (bell) {
        if (on) {
          bell.pause();
          bell.currentTime = 0;
        } else {
          bell.play();
        }
      }
      return !on;
    });
  };

  const fetchElection = async () => {
    const response = await fetch(
      `/api/election/${encodeURIComponent(
        process.env.REACT_APP_VX_ELECTION_HASH!
      )}/definition`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }
    );
    if (response.status >= 200 && response.status <= 299) {
      try {
        const jsonResponse: Election = await response.json();
        const election = safeParseElection(jsonResponse);
        if (election.isOk()) {
          setElection(election.ok());
        }
      } catch (error) {
        console.error('Failed to parse election:', error);
      }
    }
  };

  const fetchTallies = useCallback(async () => {
    const talliesString = JSON.stringify(tallies);
    const response = await fetch(
      `api/election/${encodeURIComponent(
        process.env.REACT_APP_VX_ELECTION_HASH!
      )}/tallies/${process.env.REACT_APP_VX_IS_LIVE_MODE === '1' ? 1 : 0}`
    );
    if (response.status >= 200 && response.status <= 299) {
      const jsonResponse: ServerResult[] = await response.json();
      if (talliesString !== JSON.stringify(jsonResponse)) {
        if (talliesString !== undefined && jsonResponse.length > 0) {
          isAudioNotification && deskBell.current && deskBell.current.play();
          setNewResults(true);
        }
        setTallies(jsonResponse);
      }
    } else {
      console.log(response.status, response.statusText);
    }
  }, [tallies, isAudioNotification]);

  // Init Results
  useEffect(() => {
    fetchElection();
  }, []);

  useEffect(() => {
    if (election) {
      fetchTallies();
    }
  }, [election, fetchTallies]);

  // Refresh Results
  useEffect(() => {
    const timer = setInterval(() => {
      fetchTallies();
    }, refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [fetchTallies]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setNewResults(false);
    }, newResultsTimeout * 1000);
    return () => clearTimeout(timer);
  }, [newResults, setNewResults]);

  const lastUpdatedDate =
    (tallies?.map((machine) => machine.seconds_since_epoch)[0] || 0) * 1000;

  const summedTallies = sumCompressedTallies(
    tallies?.map((t) => t.tally as CompressedTally) || []
  );
  const contestResults =
    election && !!tallies?.length && getContestTallies(summedTallies, election);

  const summedTalliesByPrecinct = tallies?.reduce<Dictionary<CompressedTally>>(
    (tallies, machine) => {
      if (tallies[machine.precinct_id]) {
        tallies[machine.precinct_id] = sumCompressedTallies([
          tallies[machine.precinct_id]!,
          machine.tally as CompressedTally,
        ]);
      } else {
        tallies[machine.precinct_id] = machine.tally as CompressedTally;
      }
      return tallies;
    },
    {}
  );
  const contestResultsByPrecinct =
    !election || !summedTalliesByPrecinct
      ? []
      : election.precincts.map((precinct) => {
          const precinctContestResults =
            summedTalliesByPrecinct[precinct.id] &&
            getContestTallies(summedTalliesByPrecinct[precinct.id]!, election);
          const contestResults = precinctContestResults
            ? getContestsForPrecinct(
                { election, electionData: '', ballotHash: '' },
                precinct.id
              ).reduce<Dictionary<Tabulation.ContestResults>>(
                (contestResults, contest) => {
                  contestResults[contest.id] =
                    precinctContestResults[contest.id];
                  return contestResults;
                },
                {}
              )
            : undefined;
          return {
            ...precinct,
            contestResults,
          };
        });
  const precinctsReportingCount = contestResultsByPrecinct.filter(
    (p) => !!p.contestResults
  ).length;
  const ReportingStatus = () => (
    <React.Fragment>
      Results reported from {precinctsReportingCount} of{' '}
      {pluralize('precinct', contestResultsByPrecinct.length, true)}.
    </React.Fragment>
  );

  const PageFooter = () => (
    <React.Fragment>
      <Container>
        <Refresh>
          {' '}
          This page will automatically refresh when new results data are
          available.
        </Refresh>
        <Refresh>
          <Button onPress={toggleIsAudioNotification}>
            {isAudioNotification
              ? 'Disable Audio Notification of New Results'
              : 'Enable Audio Notification of New Results'}
          </Button>
        </Refresh>
      </Container>
    </React.Fragment>
  );

  const CandidateContestCard = ({
    contest,
    contestTally,
    election,
  }: {
    contest: CandidateContest;
    contestTally: Tabulation.CandidateContestResults;
    election: Election;
  }) => {
    const { title, seats, candidates, id: contestId, allowWriteIns } = contest;
    const { ballots, undervotes, overvotes, tallies } = contestTally;
    const writeIn: CandidateInterface = {
      id: Tabulation.GENERIC_WRITE_IN_ID,
      name: 'write-in',
    };
    const displayCandidates = [...candidates] as CandidateInterface[]; // explicitly converting from readonly to mutable
    allowWriteIns && displayCandidates.push(writeIn);
    return (
      <Contest key={contestId}>
        <Row>
          <div>
            <ContestTitle>{title}</ContestTitle>
          </div>
          {seats > 1 && (
            <CandidateDataColumn>
              <CandidateDetail>{seats} seat</CandidateDetail>
            </CandidateDataColumn>
          )}
        </Row>
        <div>
          {[...displayCandidates]
            .sort((a, b) => {
              const ta = contestTally.tallies[a.id];
              const tb = contestTally.tallies[b.id];
              assert(ta);
              assert(tb);
              return tb.tally - ta.tally;
            })
            .map(({ id: candidateId, name }) => {
              const candidate = tallies[candidateId];
              assert(candidate);
              const candidateVotes = candidate.tally;
              return (
                <Candidate key={candidateId}>
                  <CandidateProgressBar>
                    <div
                      style={{
                        width: formatPercentage(candidateVotes, ballots),
                      }}
                    />
                  </CandidateProgressBar>
                  <CandidateRow data-percentage="50%">
                    <CandidateDataColumn>
                      <CandidateMain as="h3">{name}</CandidateMain>
                    </CandidateDataColumn>
                    <CandidateDataColumn>
                      <CandidateMain>
                        {formatPercentage(candidateVotes, ballots)}
                      </CandidateMain>
                      <CandidateDetail>
                        {pluralize('vote', candidateVotes, true)}
                      </CandidateDetail>
                    </CandidateDataColumn>
                  </CandidateRow>
                </Candidate>
              );
            })}
          <ContestMeta>
            <NoWrap>{pluralize('ballots', ballots, true)}</NoWrap> /{' '}
            <NoWrap>{pluralize('undervotes', undervotes, true)}</NoWrap> /{' '}
            <NoWrap>{pluralize('overvotes', overvotes, true)}</NoWrap>
          </ContestMeta>
        </div>
      </Contest>
    );
  };

  const YesNoContestCard = ({
    contest,
    contestTally,
    election,
  }: {
    contest: YesNoContest;
    contestTally: Tabulation.YesNoContestResults;
    election: Election;
  }) => {
    const { title, id: contestId, yesOption, noOption, description } = contest;
    const { ballots, undervotes, overvotes, yesTally, noTally } = contestTally;
    return (
      <Contest key={contestId}>
        <Row>
          <div>
            <ContestTitle>{title}</ContestTitle>
          </div>{' '}
        </Row>
        <Row style={{ marginTop: '1rem' }}>
          <UiRichTextString uiStringKey="">{description}</UiRichTextString>
        </Row>
        <div>
          <Candidate key={yesOption.id}>
            <CandidateProgressBar>
              <div
                style={{
                  width: formatPercentage(yesTally, ballots),
                }}
              />
            </CandidateProgressBar>
            <CandidateRow data-percentage="50%">
              <CandidateDataColumn>
                <CandidateMain as="h3">{yesOption.label}</CandidateMain>
              </CandidateDataColumn>
              <CandidateDataColumn>
                <CandidateMain>
                  {formatPercentage(yesTally, ballots)}
                </CandidateMain>
                <CandidateDetail>
                  {pluralize('vote', yesTally, true)}
                </CandidateDetail>
              </CandidateDataColumn>
            </CandidateRow>
          </Candidate>
          <Candidate key={noOption.id}>
            <CandidateProgressBar>
              <div
                style={{
                  width: formatPercentage(noTally, ballots),
                }}
              />
            </CandidateProgressBar>
            <CandidateRow data-percentage="50%">
              <CandidateDataColumn>
                <CandidateMain as="h3">{noOption.label}</CandidateMain>
              </CandidateDataColumn>
              <CandidateDataColumn>
                <CandidateMain>
                  {formatPercentage(noTally, ballots)}
                </CandidateMain>
                <CandidateDetail>
                  {pluralize('vote', noTally, true)}
                </CandidateDetail>
              </CandidateDataColumn>
            </CandidateRow>
          </Candidate>
          <ContestMeta>
            <NoWrap>{pluralize('ballots', ballots, true)}</NoWrap> /{' '}
            <NoWrap>{pluralize('undervotes', undervotes, true)}</NoWrap> /{' '}
            <NoWrap>{pluralize('overvotes', overvotes, true)}</NoWrap>
          </ContestMeta>
        </div>
      </Contest>
    );
  };

  const ContestsList = ({
    contestResults,
    election,
  }: {
    contestResults: Dictionary<Tabulation.ContestResults>;
    election: Election;
  }) => {
    return (
      <Contests>
        {election?.contests.map((contest) => {
          if (contest.type === 'candidate') {
            return (
              <CandidateContestCard
                key={contest.id}
                contest={contest}
                contestTally={
                  contestResults[
                    contest.id
                  ] as Tabulation.CandidateContestResults
                }
                election={election}
              />
            );
          }
          if (contest.type === 'yesno') {
            return (
              <YesNoContestCard
                key={contest.id}
                contest={contest}
                contestTally={
                  contestResults[contest.id] as Tabulation.YesNoContestResults
                }
                election={election}
              />
            );
          }
        })}
      </Contests>
    );
  };

  if (!electionHash) {
    return (
      <Main>
        <MainChild>
          <Refresh>An election hash is required.</Refresh>
        </MainChild>
      </Main>
    );
  }

  if (!election) {
    return (
      <Main>
        <MainChild>
          <Refresh>Fetching the election definition…</Refresh>
        </MainChild>
      </Main>
    );
  } else {
    if (tallies === undefined) {
      return (
        <Main>
          <MainChild>
            <Refresh>Fetching election results…</Refresh>
          </MainChild>
        </Main>
      );
    }
    return (
      <React.Fragment>
        <NavigationBanner>
          <Container>
            <Navigation>
              <Brand>
                <SealContainer>
                  <Seal seal={election.seal} maxWidth="120px" />
                </SealContainer>
                <NewResultsMessage showMessage={newResults}>
                  <span>New Results!</span>
                </NewResultsMessage>
              </Brand>
              <NavigationContent>
                <NavHeader>
                  {election.county.name}, {election.state}
                </NavHeader>
                <NavTabs>
                  <NavTab
                    active={currentPage === 'results'}
                    onClick={() => setCurrentPage('results')}
                  >
                    Results
                  </NavTab>
                  <NavTab
                    active={currentPage === 'precincts'}
                    onClick={() => setCurrentPage('precincts')}
                  >
                    Precincts
                  </NavTab>
                </NavTabs>
              </NavigationContent>
            </Navigation>
          </Container>
        </NavigationBanner>
        {currentPage === 'results' && (
          <Container>
            <Container>
              <PageHeader>
                <Headline>
                  Unofficial Results
                  {process.env.REACT_APP_VX_IS_LIVE_MODE !== '1' && (
                    <span> &mdash; Test Ballots</span>
                  )}
                </Headline>
                {!!lastUpdatedDate && (
                  <LastUpdated>
                    Last updated on{' '}
                    <NoWrap>
                      {format.localeLongDateAndTime(new Date(lastUpdatedDate))}
                    </NoWrap>
                    . <ReportingStatus /> Results do not contain absentee ballot
                    counts.
                  </LastUpdated>
                )}
                {!contestResults && <p>No results yet reported.</p>}
                <ElectionTitle>{election.title}</ElectionTitle>
                <ElectionDate>
                  <NoWrap>
                    {format.localeLongDate(
                      election.date.toMidnightDatetimeWithSystemTimezone()
                    )}
                  </NoWrap>
                </ElectionDate>
              </PageHeader>
            </Container>
            <Container>
              {!!contestResults && (
                <ContestsList
                  contestResults={contestResults}
                  election={election}
                />
              )}
            </Container>
            <PageFooter />
          </Container>
        )}
        {currentPage === 'precincts' && (
          <React.Fragment>
            <Container>
              <PageHeader>
                <Headline>Unofficial Results by Precinct</Headline>
                {!!lastUpdatedDate && (
                  <LastUpdated>
                    Last updated on{' '}
                    <NoWrap>
                      {format.localeLongDateAndTime(new Date(lastUpdatedDate))}
                    </NoWrap>
                    . <ReportingStatus /> Results do not contain absentee ballot
                    counts.
                  </LastUpdated>
                )}
              </PageHeader>
            </Container>
            <Container>
              {contestResultsByPrecinct.map((precinct) => (
                <div key={precinct.id}>
                  <PageHeader>
                    <h2>{precinct.name}</h2>
                    {!precinct.contestResults && (
                      <p>Results not yet reported.</p>
                    )}
                  </PageHeader>
                  {!!precinct.contestResults && (
                    <ContestsList
                      contestResults={precinct.contestResults}
                      election={election}
                    />
                  )}
                </div>
              ))}
            </Container>
            <PageFooter />
          </React.Fragment>
        )}
        <audio
          controls
          src="/sounds/desk-bell.mp3"
          ref={deskBell}
          style={{ display: 'none' }}
        />
      </React.Fragment>
    );
  }
};

export default App;
