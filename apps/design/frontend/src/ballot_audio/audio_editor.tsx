import styled from 'styled-components';
import React from 'react';

import { throwIllegalValue } from '@votingworks/basics';
import { TtsStringDefault } from '@votingworks/design-backend';
import { LanguageCode, TtsExportSource } from '@votingworks/types';
import { H3, RadioGroup, RadioGroupOption } from '@votingworks/ui';

import * as api from '../api';
import { TtsTextEditor } from './tts_text_editor';
import { Phoneditor } from './phoneditor';
import { AudioRecorder } from './audio_recorder';

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

const RECORD_ONLY_LANGUAGES: LanguageCode[] = [LanguageCode.KHMER];

const RECORD_ONLY_OPTION: Array<RadioGroupOption<TtsExportSource>> = [
  {
    value: 'recorded',
    label: <ModeTitle>Recorded</ModeTitle>,
  },
];

const MODE_OPTIONS: Array<RadioGroupOption<TtsExportSource>> = [
  {
    value: 'text',
    label: <ModeTitle>Text-To-Speech</ModeTitle>,
  },
  {
    value: 'phonetic',
    label: <ModeTitle>Phonetic</ModeTitle>,
  },
  ...RECORD_ONLY_OPTION,
];

export interface AudioEditorProps {
  electionId: string;
  hackyKey?: string;
  languageCode: LanguageCode;
  jurisdictionId: string;
  ttsDefault: TtsStringDefault;
}

export function AudioEditor(props: AudioEditorProps): React.ReactNode {
  const { electionId, hackyKey, languageCode, jurisdictionId, ttsDefault } =
    props;
  const [mode, setMode] = React.useState<TtsExportSource | null>(null);

  const ballotsFinalizedAt = api.getBallotsFinalizedAt.useQuery(electionId);
  const savedEdit = api.ttsEditsGet.useQuery({
    jurisdictionId,
    languageCode,
    original: ttsDefault.text,
  });

  React.useMemo(() => {
    setMode(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsDefault.key, ttsDefault.subkey]);

  if (!savedEdit.isSuccess || !ballotsFinalizedAt.isSuccess) return null;

  const recordOnly = RECORD_ONLY_LANGUAGES.includes(languageCode);
  const defaultMode: TtsExportSource = recordOnly
    ? 'recorded'
    : savedEdit.data?.exportSource || 'text';
  const currentMode = mode || defaultMode;
  const editable = !ballotsFinalizedAt.data;

  return (
    <React.Fragment>
      <ModeContainer>
        <RadioGroup
          disabled={!editable}
          label="Audio Source"
          hideLabel
          numColumns={recordOnly ? 1 : 3}
          onChange={setMode}
          options={recordOnly ? RECORD_ONLY_OPTION : MODE_OPTIONS}
          value={currentMode}
        />
      </ModeContainer>

      {(() => {
        switch (currentMode) {
          case 'text':
            return (
              <TtsTextEditor
                editable={editable}
                key={hackyKey}
                languageCode={languageCode}
                jurisdictionId={jurisdictionId}
                original={ttsDefault.text}
              />
            );

          case 'phonetic':
            return (
              <Phoneditor
                editable={editable}
                key={hackyKey}
                jurisdictionId={jurisdictionId}
                languageCode={languageCode}
                original={ttsDefault.text}
              />
            );

          case 'recorded':
            return (
              <AudioRecorder
                editable={editable}
                key={hackyKey}
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
