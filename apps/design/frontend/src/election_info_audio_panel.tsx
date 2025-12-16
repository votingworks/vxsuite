import React from 'react';
import { useParams, Redirect } from 'react-router-dom';

import { ElectionStringKey, LanguageCode } from '@votingworks/types';
import { H2 } from '@votingworks/ui';

import {
  AudioEditorExitLink,
  AudioEditorPanel,
} from './ballot_audio/audio_editor_panel';
import { BallotAudioPathParams } from './ballot_audio/routes';
import { routes } from './routes';
import * as api from './api';

const ENTITY_NAME: Partial<Record<ElectionStringKey, string>> = {
  [ElectionStringKey.COUNTY_NAME]: 'Jurisdiction',
  [ElectionStringKey.ELECTION_TITLE]: 'Title',
  [ElectionStringKey.STATE_NAME]: 'State',
};

export function ElectionInfoAudioPanel(): React.ReactNode {
  const { electionId, stringKey } = useParams<BallotAudioPathParams>();
  const infoRoutes = routes.election(electionId).electionInfo;
  const exitUrl = infoRoutes.root.path;

  const election = api.getElectionInfo.useQuery(electionId);
  const ttsDefaults = api.ttsStringDefaults.useQuery(electionId);

  const ttsDefault = React.useMemo(() => {
    if (!stringKey || !ttsDefaults.data) return undefined;

    for (const s of ttsDefaults.data) {
      if (s.key === stringKey) return s;
    }

    return undefined;
  }, [ttsDefaults.data, stringKey]);

  if (!ttsDefaults.isSuccess || !election.isSuccess) return null;

  if (!ttsDefault || !stringKey || !ENTITY_NAME[stringKey]) {
    return <Redirect to={exitUrl} />;
  }

  return (
    <AudioEditorPanel
      electionId={electionId}
      header={
        <React.Fragment>
          <AudioEditorExitLink icon="X" to={exitUrl}>
            Close
          </AudioEditorExitLink>
          <H2 style={{ margin: 0 }}>
            Election Info Audio: {ENTITY_NAME[ttsDefault.key]}
          </H2>
        </React.Fragment>
      }
      jurisdictionId={election.data.jurisdictionId}
      languageCode={LanguageCode.ENGLISH}
      ttsDefault={ttsDefault}
    />
  );
}
