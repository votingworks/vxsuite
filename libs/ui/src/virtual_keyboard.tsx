import React from 'react';
import styled, { DefaultTheme } from 'styled-components';

import { Button } from './button';
import { Icons } from './icons';
import { WithAltAudio, appStrings } from './ui_strings';

/* istanbul ignore next */
function getBorderWidthRem(p: { theme: DefaultTheme }): number {
  switch (p.theme.sizeMode) {
    case 'touchExtraLarge':
      return p.theme.sizes.bordersRem.hairline;
    default:
      return p.theme.sizes.bordersRem.thin;
  }
}

const Keyboard = styled.div`
  & button {
    border-width: ${getBorderWidthRem}rem;
    font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
    min-height: ${(p) => p.theme.sizes.minTouchAreaSizePx}px;
    min-width: ${(p) => p.theme.sizes.minTouchAreaSizePx}px;

    &:disabled {
      border-width: ${getBorderWidthRem}rem;
    }
  }
`;

const KeyRow = styled.div`
  display: flex;
  gap: ${(p) => p.theme.sizes.minTouchAreaSeparationPx}px;
  justify-content: center;
  margin-bottom: ${(p) => p.theme.sizes.minTouchAreaSeparationPx}px;
`;

const SpaceBar = styled.span`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  flex-grow: 1;
`;

export interface VirtualKeyboardProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  keyDisabled(key: string): boolean;
  keyMap?: KeyMap;
}

interface Key {
  audioLanguageOverride?: string;
  renderAudioString: () => React.ReactNode;
  /** @defaultvalue () => {@link value} */
  renderLabel?: () => React.ReactNode;
  value: string;
}

interface KeyMap {
  rows: Array<Key[]>;
}

// NOTE: Although the letter keys here are rendered and spoken in English, the
// punctuation keys are spoken in the currently selected user language, if any,
// to improve comprehension for audio-only users.
//
// This assumes all current and future VxSuite supported languages have names
// for these punctuation symbols. We may need to update this logic if we find
// that to not be true for a language we add in the future.
export const US_ENGLISH_KEYMAP: KeyMap = {
  rows: [
    [
      {
        value: 'Q',
        renderAudioString: () => appStrings.letterQ(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'W',
        renderAudioString: () => appStrings.letterW(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'E',
        renderAudioString: () => appStrings.letterE(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'R',
        renderAudioString: () => appStrings.letterR(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'T',
        renderAudioString: () => appStrings.letterT(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'Y',
        renderAudioString: () => appStrings.letterY(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'U',
        renderAudioString: () => appStrings.letterU(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'I',
        renderAudioString: () => appStrings.letterI(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'O',
        renderAudioString: () => appStrings.letterO(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'P',
        renderAudioString: () => appStrings.letterP(),
        audioLanguageOverride: 'en',
      },
    ],
    [
      {
        value: 'A',
        renderAudioString: () => appStrings.letterA(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'S',
        renderAudioString: () => appStrings.letterS(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'D',
        renderAudioString: () => appStrings.letterD(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'F',
        renderAudioString: () => appStrings.letterF(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'G',
        renderAudioString: () => appStrings.letterG(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'H',
        renderAudioString: () => appStrings.letterH(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'J',
        renderAudioString: () => appStrings.letterJ(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'K',
        renderAudioString: () => appStrings.letterK(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'L',
        renderAudioString: () => appStrings.letterL(),
        audioLanguageOverride: 'en',
      },
      {
        value: "'",
        renderAudioString: () => appStrings.labelKeyboardSingleQuote(),
      },
      {
        value: '"',
        renderAudioString: () => appStrings.labelKeyboardDoubleQuote(),
      },
    ],
    [
      {
        value: 'Z',
        renderAudioString: () => appStrings.letterZ(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'X',
        renderAudioString: () => appStrings.letterX(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'C',
        renderAudioString: () => appStrings.letterC(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'V',
        renderAudioString: () => appStrings.letterV(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'B',
        renderAudioString: () => appStrings.letterB(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'N',
        renderAudioString: () => appStrings.letterN(),
        audioLanguageOverride: 'en',
      },
      {
        value: 'M',
        renderAudioString: () => appStrings.letterM(),
        audioLanguageOverride: 'en',
      },
      { value: ',', renderAudioString: () => appStrings.labelKeyboardComma() },
      { value: '.', renderAudioString: () => appStrings.labelKeyboardPeriod() },
      { value: '-', renderAudioString: () => appStrings.labelKeyboardHyphen() },
    ],
  ],
};

export const SPACE_BAR_KEY: Key = {
  renderAudioString: () => appStrings.labelKeyboardSpaceBar(),
  renderLabel: () => appStrings.labelKeyboardSpaceBar(),
  value: ' ',
};

export function VirtualKeyboard({
  onBackspace,
  onKeyPress,
  keyDisabled,
  keyMap = US_ENGLISH_KEYMAP,
}: VirtualKeyboardProps): JSX.Element {
  function renderKey(key: Key) {
    const {
      audioLanguageOverride,
      renderAudioString,
      value,
      renderLabel = () => value,
    } = key;

    return (
      <Button
        key={value}
        value={value}
        onPress={onKeyPress}
        disabled={keyDisabled(value)}
      >
        <WithAltAudio
          audioLanguageOverride={audioLanguageOverride}
          audioText={renderAudioString()}
        >
          {renderLabel()}
        </WithAltAudio>
      </Button>
    );
  }

  return (
    <Keyboard data-testid="virtual-keyboard">
      {keyMap.rows.map((row) => (
        <KeyRow key={`row-${row.map((key) => key.value).join()}`}>
          {row.map(renderKey)}
        </KeyRow>
      ))}
      <KeyRow>
        <SpaceBar>{renderKey(SPACE_BAR_KEY)}</SpaceBar>
        <Button onPress={onBackspace}>
          <Icons.Backspace /> {appStrings.labelKeyboardDelete()}
        </Button>
      </KeyRow>
    </Keyboard>
  );
}
