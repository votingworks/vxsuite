import React from 'react';
import { useParams } from 'react-router-dom';

import { Caption, P } from '@votingworks/ui';

import styled from 'styled-components';
import { format } from '@votingworks/utils';
import * as api from '../api';
import { ElectionIdParams } from '../routes';
import { AudioControls, AudioPlayer } from './elements';

export interface RecordedAudioProps {
  stringKey?: string;
  subkey?: string;
}

const Metadata = styled.div`
  color: #444;
  padding-left: 0.5rem;
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

  return (
    <div>
      <Metadata>
        <P>
          <Caption weight="bold">File Name:</Caption>
          <br />
          {info.originalFilename}
        </P>

        <P>
          <Caption weight="bold">Uploaded:</Caption>
          <br />
          {format.localeShortDateAndTime(info.uploadedAt)}
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
