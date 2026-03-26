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

type PathParams = BallotAudioPathParams & { placeId: string };

export function PollingPlaceAudioPanel(): React.ReactNode {
  const { placeId, electionId, stringKey } = useParams<PathParams>();
  const exitUrl = routes.election(electionId).pollingPlaces.view(placeId);

  const election = api.getElectionInfo.useQuery(electionId);
  const ttsDefaults = api.ttsStringDefaults.useQuery(electionId);

  const ttsDefault = React.useMemo(() => {
    if (!stringKey || !ttsDefaults.data) return undefined;

    for (const s of ttsDefaults.data) {
      if (s.key !== stringKey || s.subkey !== placeId) continue;
      return s;
    }

    return undefined;
  }, [ttsDefaults.data, stringKey, placeId]);

  if (!ttsDefaults.isSuccess || !election.isSuccess) return null;

  if (!ttsDefault || stringKey !== ElectionStringKey.POLLING_PLACE_NAME) {
    return <Redirect to={exitUrl} />;
  }

  return (
    <AudioEditorPanel
      electionId={electionId}
      header={
        <React.Fragment>
          <AudioEditorExitLink icon="Previous" to={exitUrl}>
            Polling Place Info
          </AudioEditorExitLink>
          <H2 style={{ margin: 0 }}>Polling Place Audio: Name</H2>
        </React.Fragment>
      }
      jurisdictionId={election.data.jurisdictionId}
      languageCode={LanguageCode.ENGLISH}
      ttsDefault={ttsDefault}
    />
  );
}
