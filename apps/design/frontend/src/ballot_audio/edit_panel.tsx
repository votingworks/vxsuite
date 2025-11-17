import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import { TtsStringDefault } from '@votingworks/design-backend';
import { LanguageCode, TtsExportSource } from '@votingworks/types';
import { P, Icons, Button, Card, H3 } from '@votingworks/ui';
import React from 'react';
import { useParams, useHistory } from 'react-router-dom';
import { routes } from '../routes';
import { AudioControls, AudioPlayer, Note } from './elements';
import { BallotAudioPathParams } from './routes';
import * as api from '../api';
import { TtsTextEditor } from './text_editor';

export function EditPanel(props: { str: TtsStringDefault }): JSX.Element {
  const { str } = props;
  const [_ttsString, setTtsString] = React.useState<string>('');

  const {
    ttsMode = 'text',
    electionId,
    stringKey,
    subkey,
  } = useParams<BallotAudioPathParams>();

  React.useLayoutEffect(() => {
    const textArea = document.getElementById('ttsTextEditor');
    if (!textArea) return;

    textArea.style.height = 'auto';
    textArea.style.height = `${textArea.scrollHeight + 5}px`;
  });

  const orgId = api.getElectionInfo.useQuery(electionId).data?.orgId;
  const { data: ttsEdits, isLoading: ttsEditsLoading } =
    api.ttsEditsGet.useQuery(
      {
        orgId: orgId || '',
        languageCode: LanguageCode.ENGLISH,
        original: str.ttsText || str.text,
      },
      {
        enabled: !!orgId,
      }
    );

  const originalTtsStr = ttsEdits?.text || str.ttsText || str.text;

  React.useEffect(() => {
    setTtsString(originalTtsStr);
  }, [originalTtsStr]);

  const { mutate: ttsEditSaveText, isLoading: ttsTextOverrideSaving } =
    api.ttsEditsSet.useMutation();

  const { data: ttsAudioDataUrl, isLoading: ttsAudioDataUrlLoading } =
    api.ttsSynthesizeFromText.useQuery({
      languageCode: 'en',
      text: originalTtsStr,
    });

  function onTtsChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setTtsString(event.target.value || '');
  }

  const onTtsTextSave = React.useCallback(() => {
    // [TODO] Proper html/special-char sanitization.
    const text = _ttsString.trim().replaceAll(/["<>]/g, '');

    ttsEditSaveText({
      orgId: assertDefined(orgId),
      original: str.ttsText || str.text,
      languageCode: LanguageCode.ENGLISH,
      data: {
        exportSource: 'text',
        phonetic: ttsEdits?.phonetic || [],
        text,
      },
    });

    setTtsString(text);
  }, [
    _ttsString,
    orgId,
    str.ttsText,
    str.text,
    ttsEdits?.phonetic,
    ttsEditSaveText,
  ]);

  const history = useHistory();
  function setTtsMode(newTtsMode: TtsExportSource) {
    history.push(
      routes
        .election(electionId)
        .ballots.audio.manage(newTtsMode, assertDefined(stringKey), subkey).path
    );
  }

  const disabled =
    ttsAudioDataUrlLoading || ttsEditsLoading || ttsTextOverrideSaving;
  const ttsTextNeedsSave = originalTtsStr !== _ttsString;
  const canSave = ttsTextNeedsSave || ttsTextOverrideSaving;

  let preamble: React.ReactNode = null;
  let caption: React.ReactNode = null;
  let textEditor: React.ReactNode = null;
  let controls: React.ReactNode = null;
  switch (ttsMode) {
    case 'text':
      preamble = <P>Edit the text below to change the corresponding audio.</P>;
      caption = (
        <Note>
          <Icons.Info /> This will only affect audio output on BMDs. The text
          will continue to appear as shown in the section above.
        </Note>
      );

      textEditor = (
        <TtsTextEditor
          disabled={disabled}
          id="ttsTextEditor"
          onChange={onTtsChange}
          value={_ttsString}
        />
      );

      controls = (
        <AudioControls style={{ marginTop: '0.5rem' }}>
          <AudioPlayer
            controls
            aria-disabled={disabled || ttsTextNeedsSave}
            src={disabled || ttsTextNeedsSave ? '' : ttsAudioDataUrl}
          />
          <Button
            disabled={disabled || !canSave}
            onPress={setTtsString}
            value={originalTtsStr}
          >
            Reset
          </Button>
          <Button
            disabled={disabled || !canSave}
            icon={disabled ? 'Loading' : 'Save'}
            onPress={onTtsTextSave}
            variant={disabled || !canSave ? 'neutral' : 'primary'}
          >
            {ttsTextOverrideSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </AudioControls>
      );
      break;

    case 'phonetic':
      // [TODO] Implement phonetic editor tab.
      setTtsMode('text');
      break;

    default:
      throwIllegalValue(ttsMode);
  }

  return (
    <Card>
      <H3>Text-To-Speech</H3>
      {preamble}
      {textEditor}
      {caption}
      {controls}
    </Card>
  );
}
