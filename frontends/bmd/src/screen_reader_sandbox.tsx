import React, { useEffect } from 'react';
import { Button, Main, MainChild, Prose, Screen } from '@votingworks/ui';
import { ScreenReader } from './config/types';

interface Props {
  screenReader: ScreenReader;
}
export function ScreenReaderSandbox({ screenReader }: Props): JSX.Element {
  const [text, setText] = React.useState('');

  useEffect(() => {
    void screenReader.enable();
  }, [screenReader, screenReader.isMuted]);

  return (
    <Screen>
      <Main padded>
        <MainChild>
          <Prose>
            <h1>Screen Reader Sandbox</h1>
            <form
              onSubmit={(e) => {
                void screenReader.speak(text, { now: true });
                e.preventDefault();
              }}
            >
              <p>
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </p>
              <p>
                <Button type="submit" onPress={() => undefined}>
                  Speak
                </Button>
              </p>
            </form>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  );
}
