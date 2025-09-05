/* eslint-disable @typescript-eslint/no-use-before-define */
import React from 'react';
import { useParams } from 'react-router-dom';

import { Caption, Font, H2, H5, P } from '@votingworks/ui';

import styled from 'styled-components';
import { ElectionStringKey } from '@votingworks/types';
import { format } from '@votingworks/utils';
import * as api from '../api';
import { ElectionIdParams } from '../routes';
import { AudioControls, AudioPlayer } from './elements';

export interface RecordedAudioProps {
  // eslint-disable-next-line react/no-unused-prop-types
  stringKey?: string;
  subkey?: string;
}

const Metadata = styled.div`
  color: #444;
`;

export function RecordedAudio(props: RecordedAudioProps): React.ReactNode {
  const { stringKey = '', subkey = '' } = props;

  const { electionId } = useParams<ElectionIdParams>();
  const info = api.audioOverride.useQuery({
    electionId,
    key: stringKey,
    subkey,
  }).data;

  if (!info) return null;

  let header: JSX.Element;
  switch (stringKey) {
    case ElectionStringKey.LA_CANDIDATE_AUDIO:
      header = <RecordedAudioCandidate {...props} />;
      break;

    case ElectionStringKey.LA_CONTEST_AUDIO:
      header = <RecordedAudioContest {...props} />;
      break;

    default:
      return null;
  }

  return (
    <div>
      {header}
      <Metadata>
        <P>
          <Caption>
            <Font weight="bold">File Name:</Font> {info.originalFilename}
            <br />
            <Font weight="bold">Uploaded:</Font>{' '}
            {format.localeShortDateAndTime(info.uploadedAt)}
          </Caption>
        </P>
      </Metadata>
    </div>
  );
}

export function RecordedAudioControls(
  props: RecordedAudioProps
): React.ReactNode {
  const { stringKey = '', subkey = '' } = props;

  const { electionId } = useParams<ElectionIdParams>();
  const info = api.audioOverride.useQuery({
    electionId,
    key: stringKey,
    subkey,
  }).data;

  if (!info) return null;

  return (
    <AudioControls>
      <AudioPlayer controls src={info.dataUrl} />
    </AudioControls>
  );
}

const SubHeading = styled(H5)`
  color: #666;
  font-size: 0.8rem;
`;

const PartyName = styled(P)`
  font-size: 1rem;
`;

function RecordedAudioCandidate(props: RecordedAudioProps): React.ReactNode {
  const { subkey = '' } = props;
  const { electionId } = useParams<ElectionIdParams>();

  const contests = api.listContests.useQuery(electionId).data;
  const parties = api.listParties.useQuery(electionId).data;

  if (!contests || !parties) return null;

  let candidateName: string = '';
  let contestTitle: string = '';
  let partyId: string | undefined;
  let partyName: string = '';

  for (const contest of contests) {
    if (contest.type !== 'candidate') continue;

    for (const candidate of contest.candidates) {
      if (candidate.id !== subkey) continue;
      contestTitle = contest.title;
      candidateName = candidate.name;
      partyId = candidate.partyIds?.[0];
    }
  }

  if (partyId) {
    for (const party of parties) {
      if (party.id !== partyId) continue;
      partyName = party.name;
    }
  }

  return (
    <React.Fragment>
      <SubHeading>{contestTitle}</SubHeading>
      <H2>{candidateName}</H2>
      {partyName && <PartyName>{partyName}</PartyName>}
    </React.Fragment>
  );
}

function RecordedAudioContest(props: RecordedAudioProps): React.ReactNode {
  const { subkey = '' } = props;
  const { electionId } = useParams<ElectionIdParams>();

  const contests = api.listContests.useQuery(electionId).data;

  if (!contests) return null;

  let contestTitle: string = '';
  for (const contest of contests) {
    if (contest.id !== subkey) continue;
    contestTitle = contest.title;
  }

  return <H2>{contestTitle}</H2>;
}
