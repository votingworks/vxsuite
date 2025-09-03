/* eslint-disable @typescript-eslint/no-use-before-define */
import React from 'react';
import { useParams } from 'react-router-dom';

import { Caption, Font, H2, H5, P } from '@votingworks/ui';

import styled from 'styled-components';
import { ElectionStringKey } from '@votingworks/types';
import * as api from '../api';
import { ElectionIdParams } from '../routes';
import { AudioControls, AudioPlayer } from './elements';

export interface RecordedAudioProps {
  // eslint-disable-next-line react/no-unused-prop-types
  stringKey?: string;
  subkey?: string;
}

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
      <P>
        <Caption>
          <Font weight="bold">Filename:</Font> {info.originalFilename}
        </Caption>
      </P>
      <P>
        <Caption>
          <Font weight="bold">Uploaded:</Font>{' '}
          {info.uploadedAt.toLocaleDateString()}
        </Caption>
      </P>
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
`;

function RecordedAudioCandidate(props: RecordedAudioProps): React.ReactNode {
  const { subkey = '' } = props;
  const { electionId } = useParams<ElectionIdParams>();

  const contests = api.listContests.useQuery(electionId).data;

  if (!contests) return null;

  let candidateName: string = '';
  let contestTitle: string = '';

  for (const contest of contests) {
    if (contest.type !== 'candidate') continue;

    for (const candidate of contest.candidates) {
      if (candidate.id !== subkey) continue;
      contestTitle = contest.title;
      candidateName = candidate.name;
    }
  }

  return (
    <React.Fragment>
      <H2>{candidateName}</H2>
      <SubHeading as="h3">{contestTitle}</SubHeading>
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
