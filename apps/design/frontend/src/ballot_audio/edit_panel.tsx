import { useParams } from 'react-router-dom';
import styled from 'styled-components';

import { throwIllegalValue } from '@votingworks/basics';
import { TtsStringDefault } from '@votingworks/design-backend';
import { ElectionStringKey, TtsExportSource } from '@votingworks/types';
import { H3, RadioGroup, RadioGroupOption } from '@votingworks/ui';

import React from 'react';
import { BallotAudioPathParams } from './routes';
import { TtsTextEditor } from './tts_text_editor';
import * as api from '../api';

const Title = styled(H3)`
  font-size: 1rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.bold};
  margin: 0;
`;

const TTS_MODE_OPTIONS: Array<RadioGroupOption<TtsExportSource>> = [
  {
    value: 'text',
    label: <Title>Text-To-Speech</Title>,
  },
  {
    value: 'phonetic',
    label: <Title>Phonetic</Title>,
  },
];

const Container = styled.div`
  /* border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline}; */
  display: grid;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  /* max-height: 50rem; */
  grid-template-rows: min-content 1fr;
`;

const Header = styled.div`
  padding: 0rem 0rem 0;
  margin-bottom: 1rem;

  [role='option'] {
    /* color: ${(p) => p.theme.colors.onBackground}; */
    padding: 0.5rem 0.75rem;
  }
`;

export function EditPanel(props: {
  languageCode: string;
  onModeChange?: (newMode: TtsExportSource) => void;
  orgId: string;
  textOnly?: boolean;
  ttsDefault: TtsStringDefault;
}): React.ReactNode {
  const { languageCode, orgId, onModeChange, ttsDefault, textOnly } = props;

  const { electionId, ttsMode = 'text' } = useParams<BallotAudioPathParams>();
  const ballotsFinalizedAt = api.getBallotsFinalizedAt.useQuery(electionId);

  if (!ballotsFinalizedAt.isSuccess) return null;

  const editable = !ballotsFinalizedAt;

  return (
    <Container>
      <Header>
        {textOnly ||
        ttsDefault.key === ElectionStringKey.CONTEST_DESCRIPTION ? (
          <RadioGroup
            disabled={!editable}
            label="Audio Source"
            hideLabel
            numColumns={2}
            onChange={onModeChange ?? (() => {})}
            options={[TTS_MODE_OPTIONS[0]]}
            value={ttsMode}
          />
        ) : (
          <RadioGroup
            disabled={!editable}
            label="Audio Source"
            hideLabel
            numColumns={2}
            onChange={onModeChange ?? (() => {})}
            options={TTS_MODE_OPTIONS}
            value={ttsMode}
          />
        )}
      </Header>
      {(() => {
        switch (ttsMode) {
          case 'text':
            return (
              <TtsTextEditor
                editable={editable}
                languageCode={languageCode}
                orgId={orgId}
                original={ttsDefault.text}
              />
            );
          case 'phonetic':
            throw new Error('Not yet implemented');
          default:
            throwIllegalValue(ttsMode);
        }
      })()}
    </Container>
  );
}
