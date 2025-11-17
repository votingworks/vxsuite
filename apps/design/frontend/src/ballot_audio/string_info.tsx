import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import {
  ElectionStringKey,
  AnyContest,
  YesNoContest,
  CandidateContest,
} from '@votingworks/types';
import {
  Font,
  H3,
  List,
  ListItem,
  Caption,
  P,
  DesktopPalette,
  richTextStyles,
} from '@votingworks/ui';
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import styled from 'styled-components';
import { ElectionIdParams, routes } from '../routes';
import { SubHeading } from './elements';
import { BallotAudioPathParams } from './routes';
import * as api from '../api';
import { cssStyledScrollbars } from '../scrollbars';

const ContestDescriptionPreview = styled.div`
  height: auto;
  overflow-y: auto;

  ${richTextStyles}
`;

const Container = styled.div`
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  min-width: fit-content;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 1rem 0;

  > * {
    padding: 0 1rem;
  }

  > h3 {
    :last-child {
      margin-bottom: 0;
    }
  }

  ${ContestDescriptionPreview} {
    line-height: 1.4;
    max-height: 8rem;

    ${cssStyledScrollbars}
  }

  a {
    color: inherit;
    text-decoration-thickness: ${(p) => p.theme.sizes.bordersRem.thin}rem;
    text-decoration-style: dotted;
    text-decoration-color: ${DesktopPalette.Purple50};
    transition-duration: 100ms;
    transition-property: all;
    transition-timing-function: ease-out;

    :hover {
      color: ${(p) => p.theme.colors.onBackground};
      text-decoration-thickness: ${(p) => p.theme.sizes.bordersRem.medium}rem;
      text-decoration-style: solid;
      text-decoration-color: ${DesktopPalette.Purple80};
    }
  }

  p {
    /* line-height: 1.4; */
    margin: 0;

    &:not(:last-child) {
      margin-bottom: 0.5rem;
    }
  }

  table {
    margin-bottom: 0.5rem;
  }

  td {
    padding: 0.25rem;
  }
`;

export function StringInfo(props: {
  mini?: boolean;
  stringKey: string;
  subkey?: string;
  text: string;
}): JSX.Element {
  const { mini, stringKey, subkey, text } = props;

  switch (stringKey) {
    case ElectionStringKey.CANDIDATE_NAME:
      return (
        <StringInfoCandidateName
          id={assertDefined(subkey)}
          mini={mini}
          text={text}
        />
      );

    case ElectionStringKey.CONTEST_DESCRIPTION:
      return (
        <StringInfoContestDescription
          id={assertDefined(subkey)}
          mini={mini}
          text={text}
        />
      );

    case ElectionStringKey.CONTEST_TITLE:
      return (
        <StringInfoContestTitle
          id={assertDefined(subkey)}
          mini={mini}
          text={text}
        />
      );

    default:
      return (
        <Container>
          <Font weight="bold">Display/Print Text</Font>
          <ContestDescriptionPreview
            dangerouslySetInnerHTML={{ __html: text }}
          />
        </Container>
      );
  }
}

function StringInfoContestTitle(props: {
  id: string;
  mini?: boolean;
  text: string;
}) {
  const { id, mini, text } = props;
  const { electionId } = useParams<ElectionIdParams>();

  const contests = api.listContests.useQuery(electionId).data;
  const parties = api.listParties.useQuery(electionId).data;

  if (!contests || !parties) return null;

  let contest: AnyContest | undefined;
  for (const c of contests) {
    if (c.id !== id) continue;
    contest = c;
    break;
  }

  assert(contest);

  switch (contest?.type) {
    case 'candidate':
      return (
        <StringInfoContestTitleCandidate
          contest={contest}
          mini={mini}
          text={text}
        />
      );
    case 'yesno':
      return (
        <StringInfoContestTitleYesNo
          contest={contest}
          mini={mini}
          text={text}
        />
      );
    default:
      throwIllegalValue(contest, 'type');
  }
}

function StringInfoContestTitleYesNo(props: {
  contest: YesNoContest;
  mini?: boolean;
  text: string;
}) {
  const { contest, mini, text } = props;
  const { ttsMode = 'text', electionId } = useParams<BallotAudioPathParams>();

  return (
    <Container>
      {mini && <SubHeading>Title</SubHeading>}
      <H3>{text}</H3>
      {!mini && (
        <Link
          to={
            routes
              .election(electionId)
              .ballots.audio.manage(
                ttsMode,
                ElectionStringKey.CONTEST_DESCRIPTION,
                contest.id
              ).path
          }
          style={{ color: '#666', textDecoration: 'none' }}
        >
          <ContestDescriptionPreview
            dangerouslySetInnerHTML={{ __html: contest.description }}
          />
        </Link>
      )}
    </Container>
  );
}

function StringInfoContestTitleCandidate(props: {
  contest: CandidateContest;
  mini?: boolean;
  text: string;
}) {
  const { contest, mini, text } = props;
  const { ttsMode = 'text', electionId } = useParams<BallotAudioPathParams>();
  const parties = api.listParties.useQuery(electionId).data;

  const candidates = React.useMemo(
    () => (
      <List maxColumns={3}>
        {contest.candidates.map((c) => (
          <ListItem key={c.id}>
            <Link
              to={
                routes
                  .election(electionId)
                  .ballots.audio.manage(
                    ttsMode,
                    ElectionStringKey.CANDIDATE_NAME,
                    c.id
                  ).path
              }
            >
              <Caption>{c.name}</Caption>
            </Link>
          </ListItem>
        ))}
      </List>
    ),
    [ttsMode, contest, electionId]
  );

  if (!parties) return null;

  let contestPartyName = '';
  if (contest.partyId) {
    for (const party of parties) {
      if (party.id !== contest.partyId) continue;
      contestPartyName = party.fullName;
      break;
    }
  }

  return (
    <Container>
      {mini && <SubHeading>Title</SubHeading>}
      <H3>{text}</H3>
      {contestPartyName && <SubHeading>{contestPartyName}</SubHeading>}
      {!mini && candidates}
    </Container>
  );
}

function StringInfoContestDescription(props: {
  id: string;
  mini?: boolean;
  text: string;
}) {
  const { id, mini, text } = props;
  const { ttsMode = 'text', electionId } = useParams<BallotAudioPathParams>();

  const contests = api.listContests.useQuery(electionId).data;

  if (!contests) return null;

  let contest: YesNoContest | undefined;
  for (const c of contests) {
    if (c.id !== id) continue;
    assert(c.type === 'yesno');
    contest = c;
    break;
  }

  if (!contest) return null;

  return (
    <Container>
      {mini ? (
        <SubHeading>Description</SubHeading>
      ) : (
        <H3>
          <Link
            to={
              routes
                .election(electionId)
                .ballots.audio.manage(
                  ttsMode,
                  ElectionStringKey.CONTEST_TITLE,
                  contest.id
                ).path
            }
            style={{ color: '#666', textDecoration: 'none' }}
          >
            {contest.title}
          </Link>
        </H3>
      )}
      {}
      <ContestDescriptionPreview dangerouslySetInnerHTML={{ __html: text }} />
    </Container>
  );
}

function StringInfoCandidateName(props: {
  id: string;
  mini?: boolean;
  text: string;
}) {
  const { id, mini, text } = props;
  const { ttsMode = 'text', electionId } = useParams<BallotAudioPathParams>();

  const contests = api.listContests.useQuery(electionId).data;
  const parties = api.listParties.useQuery(electionId).data;

  const [contest, candidate, party] = React.useMemo(() => {
    for (const con of contests || []) {
      if (con.type !== 'candidate') continue;

      for (const can of con.candidates) {
        if (can.id !== id) continue;

        if (!con.partyId && !can.partyIds?.length) return [con, can];

        const partyId = con.partyId || can.partyIds?.[0];
        for (const p of parties || []) {
          if (p.id !== partyId) continue;

          return [con, can, p];
        }
      }
    }

    return [];
  }, [contests, id, parties]);

  if (!candidate || !contest) return null;

  return (
    <Container>
      <SubHeading>
        Candidate{' '}
        {!mini && (
          <React.Fragment>
            &bull;{' '}
            <Link
              to={
                routes
                  .election(electionId)
                  .ballots.audio.manage(
                    ttsMode,
                    ElectionStringKey.CONTEST_TITLE,
                    contest.id
                  ).path
              }
            >
              {contest.title}
            </Link>
          </React.Fragment>
        )}
      </SubHeading>
      <H3>{text}</H3>
      {party && <P>{party.name}</P>}
    </Container>
  );
}
