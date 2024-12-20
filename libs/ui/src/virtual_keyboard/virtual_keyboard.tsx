import styled from 'styled-components';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../button';
import { Icons } from '../icons';
import { WithAltAudio, appStrings } from '../ui_strings';
import { getBorderWidthRem, Key } from './common';
import { advanceElementFocus } from '../accessible_controllers';
import { Keybinding } from '../keybindings';

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

export type RowDirection = 'previous-row' | 'next-row';

export interface VirtualKeyboardProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  keyDisabled(key: string): boolean;
  keyMap?: KeyMap;
  enableWriteInAtiControllerNavigation?: boolean;
}

interface KeyMap {
  rows: Array<Key[]>;
}

function preventBrowserScroll(event: KeyboardEvent) {
  event.preventDefault();
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

function isPrevRow(keyMap: KeyMap, focusedRowIndex: number, rowIndex: number) {
  return (
    rowIndex === (focusedRowIndex - 1 + keyMap.rows.length) % keyMap.rows.length
  );
}

// function isNextRow(keyMap: KeyMap, focusedRowIndex: number, rowIndex: number) {
//   return rowIndex === (focusedRowIndex + 1 + keyMap.rows.length) % keyMap.rows.length;
// }

function getPrevRowFocusRefIndex(
  keyMap: KeyMap,
  focusedRowIndex: number,
  focusedKeyIndex: number
) {
  const currentRow = keyMap.rows[focusedRowIndex];
  // Position of the currently-focused key relative to start of the row
  const currentRelativePosition = focusedKeyIndex / currentRow.length;

  const prevRow = keyMap.rows[(focusedRowIndex - 1) % keyMap.rows.length];
  return Math.floor(prevRow.length * currentRelativePosition);
}

export function VirtualKeyboard({
  onBackspace,
  onKeyPress,
  keyDisabled,
  keyMap = US_ENGLISH_KEYMAP,
  enableWriteInAtiControllerNavigation,
}: VirtualKeyboardProps): JSX.Element {
  const [focusedRowIndex, setFocusedRowIndex] = useState(-1);
  const [focusedKeyIndex, setFocusedKeyIndex] = useState(-1);

  const prevRowRef = useRef<Button<string>>(null);
  const nextRowRef = useRef<Button<string>>(null);

  // Remap the default behavior of the direction keys to navigate the keyboard grid in 2D
  /* istanbul ignore next */
  const handleKeyboardEventForVirtualKeyboard = useCallback(
    (event: KeyboardEvent): void => {
      switch (event.key) {
        case Keybinding.PAGE_PREVIOUS:
          advanceElementFocus(-1);
          break;
        case Keybinding.PAGE_NEXT:
          advanceElementFocus(1);
          break;
        case Keybinding.FOCUS_PREVIOUS:
          prevRowRef.current?.focus();
          preventBrowserScroll(event);
          break;
        case Keybinding.FOCUS_NEXT:
          nextRowRef.current?.focus();
          preventBrowserScroll(event);
          break;
        case Keybinding.SELECT:
          // Enter already acts like a click
          break;
        default:
          // Simultaneous use of PAT and ATI controller for write-ins is not supported, so no need
          // to define behavior for PAT-only key events
          break;
      }
    },
    []
  );

  useEffect(() => {
    if (enableWriteInAtiControllerNavigation) {
      document.addEventListener(
        'keydown',
        handleKeyboardEventForVirtualKeyboard
      );
      return () => {
        document.removeEventListener(
          'keydown',
          handleKeyboardEventForVirtualKeyboard
        );
      };
    }
  }, [
    enableWriteInAtiControllerNavigation,
    handleKeyboardEventForVirtualKeyboard,
  ]);

  // const onOpenWriteInKeyboard = useCallback(() => {
  //   document.removeEventListener('keydown', handleKeyboardEvent);
  //   document.addEventListener('keydown', handleKeyboardEventForVirtualKeyboard);
  // }, []);

  // const onCloseWriteInKeyboard = useCallback(() => {
  //   document.removeEventListener(
  //     'keydown',
  //     handleKeyboardEventForVirtualKeyboard
  //   );
  //   document.addEventListener('keydown', handleKeyboardEvent);
  // }, []);

  function renderKey(key: Key, rowIndex: number, keyIndex: number) {
    const {
      audioLanguageOverride,
      renderAudioString,
      value,
      renderLabel = () => value,
    } = key;

    let ref;
    if (
      isPrevRow(keyMap, focusedRowIndex, rowIndex) &&
      getPrevRowFocusRefIndex(keyMap, focusedRowIndex, focusedKeyIndex) ===
        keyIndex
    ) {
      ref = prevRowRef;
    }

    return (
      <Button
        key={value}
        ref={ref}
        value={value}
        onPress={onKeyPress}
        disabled={keyDisabled(value)}
        onFocus={(e: React.FocusEvent<HTMLButtonElement>) => {
          e.preventDefault();
          setFocusedRowIndex(rowIndex);
          setFocusedKeyIndex(keyIndex);
        }}
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
      {keyMap.rows.map((row, rowIndex) => (
        <KeyRow key={`row-${row.map((key) => key.value).join()}`}>
          {row.map((key, keyIndex) => renderKey(key, rowIndex, keyIndex))}
        </KeyRow>
      ))}
      <KeyRow>
        <SpaceBar>{renderKey(SPACE_BAR_KEY, keyMap.rows.length, 0)}</SpaceBar>
        <Button onPress={onBackspace}>
          <Icons.Backspace /> {appStrings.labelKeyboardDelete()}
        </Button>
      </KeyRow>
    </Keyboard>
  );
}
