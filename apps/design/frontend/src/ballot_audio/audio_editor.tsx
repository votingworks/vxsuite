import styled from 'styled-components';
import React from 'react';

import { throwIllegalValue } from '@votingworks/basics';
import { TtsStringDefault } from '@votingworks/design-backend';
import { TtsExportSource } from '@votingworks/types';
import { H3, RadioGroup, RadioGroupOption } from '@votingworks/ui';

import * as api from '../api';
import { TtsTextEditor } from './tts_text_editor';
import { Phoneditor } from './phoneditor';

const ModeContainer = styled.div`
  button {
    padding: 0.5rem 0.75rem !important;
  }
`;

const ModeTitle = styled(H3)`
  font-size: 1rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.bold};
  margin: 0;
`;

const TTS_MODE_OPTIONS: Array<RadioGroupOption<TtsExportSource>> = [
  {
    value: 'text',
    label: <ModeTitle>Text-To-Speech</ModeTitle>,
  },
  {
    value: 'phonetic',
    label: <ModeTitle>Phonetic</ModeTitle>,
  },
];

export interface AudioEditorProps {
  electionId: string;
  languageCode: string;
  jurisdictionId: string;
  ttsDefault: TtsStringDefault;
}

export function AudioEditor(props: AudioEditorProps): React.ReactNode {
  const { electionId, languageCode, jurisdictionId, ttsDefault } = props;
  const [mode, setMode] = React.useState<TtsExportSource | null>(null);

  const ballotsFinalizedAt = api.getBallotsFinalizedAt.useQuery(electionId);
  const savedEdit = api.ttsEditsGet.useQuery({
    jurisdictionId,
    languageCode,
    original: ttsDefault.text,
  });

  if (!savedEdit.isSuccess || !ballotsFinalizedAt.isSuccess) return null;

  const defaultMode = savedEdit.data?.exportSource || 'text';
  const currentMode = mode || defaultMode;
  const editable = !ballotsFinalizedAt.data;

  return (
    <React.Fragment>
      <ModeContainer>
        <RadioGroup
          disabled={!editable}
          label="Audio Source"
          hideLabel
          numColumns={2}
          onChange={setMode}
          options={TTS_MODE_OPTIONS}
          value={currentMode}
        />
      </ModeContainer>

      {(() => {
        switch (currentMode) {
          case 'text':
            return (
              <TtsTextEditor
                editable={editable}
                languageCode={languageCode}
                jurisdictionId={jurisdictionId}
                original={ttsDefault.text}
              />
            );

          case 'phonetic':
            return (
              <Phoneditor
                editable={editable}
                jurisdictionId={jurisdictionId}
                languageCode={languageCode}
                original={ttsDefault.text}
              />
            );

          default:
            throwIllegalValue(currentMode);
        }
      })()}
    </React.Fragment>
  );
}
