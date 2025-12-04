import React from 'react';
import { useParams, Redirect } from 'react-router-dom';
import styled from 'styled-components';

import { TtsStringDefault } from '@votingworks/design-backend';
import { ElectionStringKey, LanguageCode } from '@votingworks/types';
import { LinkButton, H2 } from '@votingworks/ui';

import { AudioEditorPanel } from './ballot_audio/audio_editor_panel';
import { BallotAudioPathParams } from './ballot_audio/routes';
import { routes } from './routes';
import * as api from './api';

const ExitLink = styled(LinkButton)`
  font-size: 0.8rem;
  gap: 0.25rem;
  margin-bottom: 0.3rem;
  padding: 0;

  &:active,
  &:focus,
  &:hover {
    background: none !important;
    text-decoration: underline;
    text-decoration-thickness: ${(p) => p.theme.sizes.bordersRem.medium}rem;
  }
`;

const ENTITY_NAME: Partial<Record<ElectionStringKey, string>> = {
  [ElectionStringKey.PARTY_FULL_NAME]: 'Full Name',
  [ElectionStringKey.PARTY_NAME]: 'Short Name',
};

export function PartyAudioPanel(): React.ReactNode {
  const { electionId, stringKey, subkey } = useParams<BallotAudioPathParams>();
  const partyRoutes = routes.election(electionId).parties2;

  const election = api.getElectionInfo.useQuery(electionId);
  const ttsDefaults = api.ttsStringDefaults.useQuery(electionId);

  const ttsDefault = React.useMemo(() => {
    if (!stringKey || !ttsDefaults.data) return undefined;

    for (const s of ttsDefaults.data) {
      if (s.key !== stringKey || s.subkey !== subkey) continue;
      return s;
    }

    return undefined;
  }, [ttsDefaults.data, stringKey, subkey]);

  // [TODO] Show a loading state instead.
  if (!ttsDefaults.isSuccess || !election.isSuccess) return null;

  if (!ttsDefault || !stringKey || !ENTITY_NAME[stringKey]) {
    return <Redirect to={partyRoutes.root.path} />;
  }

  return (
    <AudioEditorPanel
      electionId={electionId}
      header={
        <React.Fragment>
          <ExitLink
            icon="X"
            fill="transparent"
            variant="primary"
            to={partyRoutes.root.path}
          >
            Close
          </ExitLink>
          <H2 style={{ margin: 0 }}>
            Party Audio: {ENTITY_NAME[ttsDefault.key]}
          </H2>
        </React.Fragment>
      }
      key={joinStringKey(ttsDefault)}
      languageCode={LanguageCode.ENGLISH}
      orgId={election.data.orgId}
      ttsDefault={ttsDefault}
    />
  );
}

function joinStringKey(info: TtsStringDefault) {
  if (!info.subkey) return info.key;

  return `${info.key}.${info.subkey}`;
}
