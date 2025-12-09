import styled from 'styled-components';
import React from 'react';

import { throwIllegalValue } from '@votingworks/basics';
import { TtsStringDefault } from '@votingworks/design-backend';
import { ElectionStringKey, TtsExportSource } from '@votingworks/types';
import { H3, P, RadioGroup, RadioGroupOption } from '@votingworks/ui';

import * as api from '../api';
import { TtsTextEditor } from './tts_text_editor';

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
  orgId: string;
  ttsDefault: TtsStringDefault;

  /**
   * For development/testing - phonetic editing will be a fast-follow after
   * initial launch of plain text editing.
   * [TODO] Remove once launched.
   */
  phoneticEnabled?: boolean;
}

export function AudioEditor(props: AudioEditorProps): React.ReactNode {
  const { electionId, languageCode, orgId, phoneticEnabled, ttsDefault } =
    props;
  const [mode, setMode] = React.useState<TtsExportSource | null>(null);

  const ballotsFinalizedAt = api.getBallotsFinalizedAt.useQuery(electionId);
  const savedEdit = api.ttsEditsGet.useQuery({
    orgId,
    languageCode,
    original: ttsDefault.text,
  });

  if (!savedEdit.isSuccess || !ballotsFinalizedAt.isSuccess) return null;

  const defaultMode = savedEdit.data?.exportSource || 'text';
  const currentMode = mode || defaultMode;
  const editable = !ballotsFinalizedAt.data;

  // Phonetic editing isn't supported for ballot measures at the moment, given
  // how long/complex they can get.
  //
  // [TODO] Consider approaches that allow users to edit with a combination of
  // text editing and spot editing certain words, like names of people/places,
  // with phonetic edits.
  const textOnly =
    ttsDefault.key === ElectionStringKey.CONTEST_DESCRIPTION ||
    !phoneticEnabled;

  return (
    <React.Fragment>
      <ModeContainer>
        <RadioGroup
          disabled={!editable}
          label="Audio Source"
          hideLabel
          numColumns={2}
          onChange={setMode}
          options={textOnly ? [TTS_MODE_OPTIONS[0]] : TTS_MODE_OPTIONS}
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
                orgId={orgId}
                original={ttsDefault.text}
              />
            );

          case 'phonetic':
            return <P>TODO: Phonetic Editor</P>;

          default:
            throwIllegalValue(currentMode);
        }
      })()}
    </React.Fragment>
  );
}
