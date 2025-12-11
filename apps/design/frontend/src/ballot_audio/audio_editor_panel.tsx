import styled from 'styled-components';
import React from 'react';

import { assertDefined } from '@votingworks/basics';
import { TtsStringDefault } from '@votingworks/design-backend';
import { ElectionStringKey, YesNoContest } from '@votingworks/types';

import { LinkButton, LinkButtonProps } from '@votingworks/ui';
import * as api from '../api';
import { UiStringPreview } from './ui_string_preview';
import { AudioEditor } from './audio_editor';

const Container = styled.div`
  display: grid;
  gap: 0.75rem;
  grid-template-rows: min-content max-content min-content 1fr;
  height: 100%;
  max-height: 100%;
  max-width: 50rem;
  overflow: hidden;
  padding: 1rem;
`;

export interface AudioEditorPanelProps {
  electionId: string;
  header: React.ReactNode;
  languageCode: string;
  jurisdictionId: string;
  ttsDefault: TtsStringDefault;
}

export function AudioEditorPanel(
  props: AudioEditorPanelProps
): React.ReactNode {
  const { electionId, header, languageCode, jurisdictionId, ttsDefault } =
    props;

  return (
    <Container>
      <div>{header}</div>

      {ttsDefault.key === ElectionStringKey.CONTEST_DESCRIPTION ? (
        <ContestDescriptionPreview
          contestId={assertDefined(
            ttsDefault.subkey,
            'subkey missing for contest description TTS string'
          )}
          electionId={electionId}
        />
      ) : (
        <UiStringPreview stringKey={ttsDefault.key} text={ttsDefault.text} />
      )}

      <AudioEditor
        electionId={electionId}
        languageCode={languageCode}
        jurisdictionId={jurisdictionId}
        ttsDefault={ttsDefault}
      />
    </Container>
  );
}

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
    text-underline-offset: ${(p) => p.theme.sizes.bordersRem.medium}rem;
  }
`;

export function AudioEditorExitLink(props: LinkButtonProps): React.ReactNode {
  return <ExitLink {...props} fill="transparent" variant="primary" />;
}

/**
 * Displays the original description HTML for the given contest, since the
 * the corresponding TTS string default has HTML stripped for speech synthesis.
 */
export function ContestDescriptionPreview(props: {
  contestId: string;
  electionId: string;
}): React.ReactNode {
  const { contestId, electionId } = props;
  const contests = api.listContests.useQuery(electionId).data;

  const contest = React.useMemo(() => {
    if (!contests) return undefined;

    return contests.find(
      (c): c is YesNoContest => c.id === contestId && c.type === 'yesno'
    );
  }, [contestId, contests]);

  if (!contest) return null;

  return (
    <UiStringPreview
      stringKey={ElectionStringKey.CONTEST_DESCRIPTION}
      text={contest.description}
    />
  );
}
