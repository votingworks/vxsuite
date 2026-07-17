/* eslint-disable no-console */
/* istanbul ignore file */
/* eslint-disable jsx-a11y/media-has-caption */

import { Button, DesktopPalette } from '@votingworks/ui';
import React from 'react';

import { LanguageCode, TtsEditKey } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import * as api from '../api';

export function AudioRecorder(props: {
  editable?: boolean;
  languageCode: LanguageCode;
  jurisdictionId: string;
  original: string;
}): React.ReactNode {
  const { editable, jurisdictionId, languageCode, original } = props;
  const [clip, setClip] = React.useState<Blob>();
  const [recording, setRecording] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const editKey: TtsEditKey = { jurisdictionId, languageCode, original };
  const savedEdit = api.ttsEditsGet.useQuery(editKey).data;
  const saveMutation = api.ttsEditsSet.useMutation();

  function deleteSaved() {
    if (!savedEdit) return;

    saveMutation.mutate({
      ...editKey,
      data: {
        exportSource: savedEdit.phonetic.length ? 'phonetic' : 'text',
        phonetic: savedEdit.phonetic,
        text: savedEdit.text,
        recordingDataUrl: '',
      },
    });
  }

  async function save() {
    if (!clip) return;

    setSaving(true);

    await new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        assert(typeof reader.result === 'string');

        await saveMutation.mutateAsync({
          ...editKey,
          data: {
            exportSource: 'recorded',
            phonetic: savedEdit?.phonetic || [],
            text: savedEdit?.text || '',
            recordingDataUrl: reader.result,
          },
        });

        resolve();
      };
      reader.onerror = reject;
      reader.readAsDataURL(clip);
    });

    setClip(undefined);
    setSaving(false);
  }

  const clipDataUrl = clip && URL.createObjectURL(clip);

  return (
    <div style={{ paddingTop: '0.5rem' }}>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          // flexDirection: 'column',
          gap: '1rem',
          justifyContent: 'space-between',
        }}
      >
        <audio
          controls
          src={clipDataUrl || savedEdit?.recordingDataUrl || ''}
        />

        <div style={{ justifyContent: 'end', display: 'flex', gap: '0.5rem' }}>
          {clip && (
            <Button icon="Delete" onPress={setClip} value={undefined}>
              Cancel
            </Button>
          )}
          {clip && (
            <Button
              icon={saving ? 'Loading' : 'Save'}
              onPress={save}
              variant="primary"
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          )}

          {editable && !recording && !clip && savedEdit?.recordingDataUrl && (
            <Button
              color="danger"
              fill="outlined"
              icon="Trash"
              onPress={deleteSaved}
            >
              Delete
            </Button>
          )}
          {editable && !clip && (
            <RecordButton
              onRecord={setClip}
              recording={recording}
              replace={!!savedEdit?.recordingDataUrl}
              setRecording={setRecording}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function RecordButton(props: {
  replace: boolean;
  onRecord: (b: Blob) => void;
  recording: boolean;
  setRecording: (r: boolean) => void;
}): React.ReactNode {
  const { onRecord, recording, replace, setRecording } = props;
  const recorderRef = React.useRef<MediaRecorder>();
  const chunksRef = React.useRef<Blob[]>([]);

  const start = React.useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      for (const t of stream.getTracks()) t.stop();
      onRecord?.(blob);
    };

    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }, [onRecord, setRecording]);

  const stop = React.useCallback(() => {
    recorderRef.current?.stop();

    void navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
    });

    recorderRef.current = undefined;
    setRecording(false);
  }, [setRecording]);

  function toggle() {
    if (recording) stop();
    else start().catch((err) => console.error('Mic access failed:', err));
  }

  if (!recording && recorderRef.current) stop();

  return (
    <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
      <Button
        // color={recording ? 'neutral' : 'primary'}
        onPress={toggle}
        aria-label={recording ? 'Stop recording' : 'Start recording'}
        icon={recording ? 'SquareSolid' : 'Mic'}
        fill={replace ? 'outlined' : undefined}
        variant={recording ? undefined : 'primary'}
        style={{
          animation: recording
            ? 'record-pulse 0.6s ease-in-out infinite alternate'
            : 'none',
        }}
      >
        {recording ? 'Recording...' : replace ? 'Re-record' : 'Record'}
        <style>{`
        @keyframes record-pulse {
          from   { color: ${DesktopPalette.Red80}; }
          to     { color: ${DesktopPalette.Gray60}; }
        }
      `}</style>
      </Button>
    </div>
  );
}
