import React from 'react';
import { useParams, Redirect } from 'react-router-dom';

import { TtsStringDefault } from '@votingworks/design-backend';
import { ElectionStringKey, LanguageCode } from '@votingworks/types';
import { H2 } from '@votingworks/ui';

import {
  AudioEditorExitLink,
  AudioEditorPanel,
} from './ballot_audio/audio_editor_panel';
import { BallotAudioPathParams } from './ballot_audio/routes';
import { routes } from './routes';
import * as api from './api';

export function DistrictAudioPanel(): React.ReactNode {
  const { electionId, stringKey, subkey } = useParams<BallotAudioPathParams>();
  const districtRoutes = routes.election(electionId).districts;

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

  if (!ttsDefaults.isSuccess || !election.isSuccess) return null;

  if (!ttsDefault || stringKey !== ElectionStringKey.DISTRICT_NAME) {
    return <Redirect to={districtRoutes.root.path} />;
  }

  return (
    <AudioEditorPanel
      electionId={electionId}
      header={
        <React.Fragment>
          <AudioEditorExitLink icon="X" to={districtRoutes.root.path}>
            Close
          </AudioEditorExitLink>
          <H2 style={{ margin: 0 }}>District Audio: Name</H2>
        </React.Fragment>
      }
      key={joinStringKey(ttsDefault)}
      languageCode={LanguageCode.ENGLISH}
      jurisdictionId={election.data.jurisdictionId}
      ttsDefault={ttsDefault}
    />
  );
}

function joinStringKey(info: TtsStringDefault) {
  if (!info.subkey) return info.key;

  return `${info.key}.${info.subkey}`;
}
