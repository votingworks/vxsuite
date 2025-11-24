import React from 'react';
import styled from 'styled-components';

import { assertDefined } from '@votingworks/basics';
import { TtsEdit } from '@votingworks/types';
import { Icons, Button, DesktopPalette, Caption, Font } from '@votingworks/ui';

import * as api from '../api';
import { cssThemedScrollbars } from '../scrollbars';

const Container = styled.div`
  display: grid;
  max-height: 100%;
  grid-template-rows: min-content 1fr;
  overflow: hidden;
`;

const Header = styled(Font)`
  box-shadow: 0 0.25rem 0.5rem rgba(255, 255, 255, 75%);
  display: block;
  padding: 0 0 0.5rem;
  margin: 0;
  z-index: 1;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 10rem;
  overflow-y: auto;
  position: relative;
  margin: 0.25rem 0 0;
  padding-right: 0.25rem;

  ${cssThemedScrollbars}
`;

const TextMirror = styled.pre`
  /* stylelint-disable no-empty-source */
`;

const Editor = styled.div`
  --tts-editor-border-width: ${(p) => p.theme.sizes.bordersRem.thin}rem;
  --tts-editor-line-height: 1.4;
  --tts-editor-padding: 0.5rem 0.75rem;

  line-height: var(--tts-editor-line-height);
  margin: 0 0 1rem;
  position: relative;
  width: 100%;

  > textarea {
    border-width: var(--tts-editor-border-width);
    display: block;
    height: 100%;
    left: 0;
    line-height: var(--tts-editor-line-height);
    margin: 0 0 0.25rem;
    min-height: 100%;
    overflow: hidden;
    padding: var(--tts-editor-padding);
    position: absolute;
    resize: none;
    top: 0;
    width: 100%;

    ${cssThemedScrollbars}

    :focus {
      border-color: ${DesktopPalette.Purple60};
      outline: none;
    }
  }

  ${TextMirror} {
    border: var(--tts-editor-border-width) solid transparent;
    display: block;
    font-family: inherit;
    font-size: inherit;
    height: 100%;
    line-height: var(--tts-editor-line-height);
    margin: 0;
    min-height: 4rem;
    padding: var(--tts-editor-padding);
    visibility: hidden;
    white-space: pre-wrap;
  }
`;

const Note = styled(Caption)`
  color: #444;
  display: block;
  margin: 0 0 0.5rem 0.1rem;
`;

const Footer = styled.div`
  background: ${(p) => p.theme.colors.background};
  border-top: 1px solid ${DesktopPalette.Gray30};
  gap: 0.5rem;
  padding: 0.5rem 0 0;
  position: sticky;

  /** Bottom of the buttons get clipped a bit on Safari and Firefox. */
  bottom: 0.125rem;
`;

const Controls = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap-reverse;
  gap: 0.5rem;
  justify-content: space-between;
`;

const Player = styled.audio`
  &[aria-disabled] {
    cursor: not-allowed;
  }
`;

const PlayerOverlay = styled.div`
  align-items: center;
  background: rgba(255, 255, 255, 50%);
  display: flex;
  font-size: 1.5rem;
  height: 100%;
  justify-content: center;
  left: 0;
  position: absolute;
  top: 0;
  width: 100%;
`;

type PlayerState = 'disabled' | 'loading' | 'ready';

const PlayerContainer = styled.div<{ state: PlayerState }>`
  position: relative;

  > ${PlayerOverlay} {
    cursor: not-allowed;
    display: ${(p) => (p.state === 'ready' ? 'none' : 'flex')};

    > svg {
      display: ${(p) => (p.state === 'loading' ? undefined : 'none')};
    }
  }
`;

const FormButtons = styled.div`
  display: flex;
  gap: 0.5rem;
`;

export interface TtsTextEditorProps {
  languageCode: string;
  orgId: string;
  original: string;
}

export function TtsTextEditor(props: TtsTextEditorProps): React.ReactNode {
  const { languageCode, orgId, original } = props;

  const savedEdit = api.ttsEditsGet.useQuery({
    orgId,
    languageCode,
    original,
  });

  // [TODO] Render a loading state instead.
  if (!savedEdit.isSuccess) return null;

  return <EditorImpl {...props} savedEdit={savedEdit.data} />;
}

function EditorImpl(
  props: TtsTextEditorProps & { savedEdit: TtsEdit | null }
): JSX.Element {
  const { languageCode, orgId, original, savedEdit } = props;
  const [edit, setEdit] = React.useState<string | null>(null);

  const defaultValue = savedEdit?.text || original;

  const { data: audioDataUrl, isLoading: audioLoading } =
    api.ttsSynthesizeFromText.useQuery({
      languageCode,
      text: defaultValue,
    });

  const { mutate: save, isLoading: saving } = api.ttsEditsSet.useMutation();

  function onSubmit(event: React.FormEvent) {
    event.stopPropagation();
    event.preventDefault();

    save(
      {
        orgId: assertDefined(orgId),
        original,
        languageCode,
        data: {
          exportSource: 'text',
          phonetic: savedEdit?.phonetic || [],
          text: assertDefined(edit).trim(),
        },
      },
      { onSuccess: () => setEdit(null) }
    );
  }

  const value = edit ?? defaultValue;
  const textChanged = value !== defaultValue;
  const isEmpty = !value || value.trim() === '';

  const resetDisabled = !textChanged || audioLoading || saving;
  const saveDisabled = resetDisabled || isEmpty;

  const playerState: PlayerState = (() => {
    if (textChanged) return 'disabled';
    if (audioLoading) return 'loading';
    return 'ready';
  })();

  return (
    <Container>
      <Header>
        <Icons.ChevronRight /> Edit the text below to change the corresponding
        audio:
      </Header>

      <Form onReset={() => setEdit(null)} onSubmit={onSubmit}>
        <Editor>
          {/*
           * Mirror the textarea's text in a background element to provide an
           * explicit height for the container (since we can't dynamically
           * grow a textarea with just CSS).
           *
           * The extra period just ensures that the `Mirror` grows accordingly
           * when the last character inserted is a newline (the newline is
           * otherwise ignored by the browser, it seems).
           */}
          <TextMirror>{value}.</TextMirror>

          <textarea
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            disabled={saving}
            id="ttsTextEditor"
            name="ttsText"
            onChange={(event) => setEdit(event.target.value)}
            value={value}
          />
        </Editor>

        <Footer>
          <Note>
            <Icons.Info /> This will only affect audio output on BMDs. The text
            will continue to appear as shown in the section above.
          </Note>

          <Controls>
            <PlayerContainer state={playerState}>
              <Player
                aria-disabled={playerState !== 'ready'}
                aria-label="Audio Player"
                controls
                src={playerState === 'ready' ? audioDataUrl : ''}
              />
              <PlayerOverlay>
                <Icons.Loading />
              </PlayerOverlay>
            </PlayerContainer>

            <FormButtons>
              <Button disabled={resetDisabled} type="reset">
                Reset
              </Button>
              <Button
                disabled={saveDisabled}
                icon={saving ? 'Loading' : 'Save'}
                type="submit"
                variant={saveDisabled ? 'neutral' : 'primary'}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </FormButtons>
          </Controls>
        </Footer>
      </Form>
    </Container>
  );
}
