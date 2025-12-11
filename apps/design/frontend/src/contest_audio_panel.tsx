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
  [ElectionStringKey.CANDIDATE_NAME]: 'Candidate Name',
  [ElectionStringKey.CONTEST_DESCRIPTION]: 'Description',
  [ElectionStringKey.CONTEST_OPTION_LABEL]: 'Option Label',
  [ElectionStringKey.CONTEST_TERM]: 'Term',
  [ElectionStringKey.CONTEST_TITLE]: 'Title',
};

type PathParams = BallotAudioPathParams & { contestId: string };

export function ContestAudioPanel(): React.ReactNode {
  const { contestId, electionId, stringKey, subkey } = useParams<PathParams>();
  const contestRoutes = routes.election(electionId).contests;
  const exitUrl = contestRoutes.view(contestId).path;

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

  if (!ttsDefault || !stringKey || !ENTITY_NAME[stringKey]) {
    return <Redirect to={exitUrl} />;
  }

  return (
    <AudioEditorPanel
      electionId={electionId}
      header={
        <React.Fragment>
          <AudioEditorExitLink icon="Previous" to={exitUrl}>
            Contest Info
          </AudioEditorExitLink>

          <H2 style={{ margin: 0 }}>
            Contest Audio: {ENTITY_NAME[ttsDefault.key]}
          </H2>
        </React.Fragment>
      }
      languageCode={LanguageCode.ENGLISH}
      jurisdictionId={election.data.jurisdictionId}
      ttsDefault={ttsDefault}
    />
  );
}
