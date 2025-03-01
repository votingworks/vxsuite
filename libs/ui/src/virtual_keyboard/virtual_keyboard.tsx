import React, { Ref, useCallback, useEffect, useRef, useState } from 'react';
import styled, { DefaultTheme } from 'styled-components';

import { Button } from '../button';
import { WithAltAudio, appStrings } from '../ui_strings';
import { Icons } from '../icons';
import { Key } from './common';
import { advanceElementFocus } from '../accessible_controllers';
import { Keybinding } from '../keybindings';

/* istanbul ignore next - @preserve */
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

// The last row is language agnostic and defined outside the KeyMap
const NUM_LANGUAGE_AGNOSTIC_ROWS = 1;
// 2 keys in the last row, `Space` and `Delete`
const NUM_KEYS_IN_LAST_ROW = 2;

function numRows(keyMap: KeyMap) {
  return keyMap.rows.length + NUM_LANGUAGE_AGNOSTIC_ROWS;
}

function getAdjacentRowIndex(
  keyMap: KeyMap,
  focusedRowIndex: number,
  direction: -1 | 1
) {
  return (focusedRowIndex + direction + numRows(keyMap)) % numRows(keyMap);
}

function getPrevRowIndex(keyMap: KeyMap, focusedRowIndex: number) {
  return getAdjacentRowIndex(keyMap, focusedRowIndex, -1);
}

function getNextRowIndex(keyMap: KeyMap, focusedRowIndex: number) {
  return getAdjacentRowIndex(keyMap, focusedRowIndex, 1);
}

/**
 * Returns the position of the focused key relative to the start of its row.
 * Position is expressed as a percent.
 * eg. in a row QWERTYUIOP (10 keys), `W` has a relative position of 1 / 10 = 0.10
 */
function getFocusedKeyRelativePosition(
  keyMap: KeyMap,
  focusedRowIndex: number,
  focusedKeyIndex: number
) {
  const numKeysInCurrentRow = keyMap.rows[focusedRowIndex]
    ? keyMap.rows[focusedRowIndex].length
    : NUM_KEYS_IN_LAST_ROW;
  return focusedKeyIndex / numKeysInCurrentRow;
}

function getAdjacentRowFocusRefIndex(
  keyMap: KeyMap,
  focusedRowIndex: number,
  focusedKeyIndex: number,
  direction: -1 | 1
) {
  const currentRelativePosition = getFocusedKeyRelativePosition(
    keyMap,
    focusedRowIndex,
    focusedKeyIndex
  );

  const adjacentRowIndex = getAdjacentRowIndex(
    keyMap,
    focusedRowIndex,
    direction
  );
  // The target adjacent row may be the `space + delete` row, which is special-cased and not part of keyMap
  const numKeysInPrevRow = keyMap.rows[adjacentRowIndex]
    ? keyMap.rows[adjacentRowIndex].length
    : NUM_KEYS_IN_LAST_ROW;
  return Math.min(
    Math.round(numKeysInPrevRow * currentRelativePosition),
    numKeysInPrevRow - 1
  );
}

/**
 * Returns the index of the Key to focus if the user navigates to the previous row.
 * Index of the Key is relative to its parent row only (not to all keys on the keyboard).
 */
function getPrevRowFocusRefIndex(
  keyMap: KeyMap,
  focusedRowIndex: number,
  focusedKeyIndex: number
) {
  return getAdjacentRowFocusRefIndex(
    keyMap,
    focusedRowIndex,
    focusedKeyIndex,
    -1
  );
}

/**
 * Returns the index of the Key to focus if the user navigates to the next row.
 * Index of the Key is relative to its parent row only (not to all keys on the keyboard).
 */
function getNextRowFocusRefIndex(
  keyMap: KeyMap,
  focusedRowIndex: number,
  focusedKeyIndex: number
) {
  return getAdjacentRowFocusRefIndex(
    keyMap,
    focusedRowIndex,
    focusedKeyIndex,
    1
  );
}

export function VirtualKeyboard({
  onBackspace,
  onKeyPress,
  keyDisabled,
  keyMap = US_ENGLISH_KEYMAP,
  enableWriteInAtiControllerNavigation,
}: VirtualKeyboardProps): JSX.Element {
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const [focusedKeyIndex, setFocusedKeyIndex] = useState(0);

  const prevRowRef = useRef<Button<string>>(null);
  const nextRowRef = useRef<Button<string>>(null);

  const lastRowIndex = numRows(keyMap) - 1;

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

  const createOnFocusHandler = useCallback(
    (
      rowIndex: number,
      keyIndex: number
    ): ((e: React.FocusEvent<HTMLButtonElement>) => void) =>
      (e: React.FocusEvent<HTMLButtonElement>) => {
        e.preventDefault();
        setFocusedRowIndex(rowIndex);
        setFocusedKeyIndex(keyIndex);
      },
    []
  );

  function renderKey(
    key: Key,
    rowIndex: number,
    keyIndex: number,
    ref?: Ref<Button<string>>
  ) {
    const {
      audioLanguageOverride,
      renderAudioString,
      value,
      renderLabel = () => value,
    } = key;

    return (
      <Button
        key={value}
        ref={ref}
        value={value}
        onPress={onKeyPress}
        disabled={keyDisabled(value)}
        onFocus={createOnFocusHandler(rowIndex, keyIndex)}
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

  function getRefForLastRow(keyIndex: number) {
    if (
      getPrevRowIndex(keyMap, focusedRowIndex) === lastRowIndex &&
      getPrevRowFocusRefIndex(keyMap, focusedRowIndex, focusedKeyIndex) ===
        keyIndex
    ) {
      return prevRowRef;
    }
    if (
      getNextRowIndex(keyMap, focusedRowIndex) === lastRowIndex &&
      getNextRowFocusRefIndex(keyMap, focusedRowIndex, focusedKeyIndex) ===
        keyIndex
    ) {
      return nextRowRef;
    }
  }

  return (
    <Keyboard data-testid="virtual-keyboard">
      {keyMap.rows.map((row, rowIndex) => {
        const isPrevRow = rowIndex === getPrevRowIndex(keyMap, focusedRowIndex);
        const isNextRow = rowIndex === getNextRowIndex(keyMap, focusedRowIndex);
        return (
          <KeyRow key={`row-${row.map((key) => key.value).join()}`}>
            {row.map((key, keyIndex) => {
              const prevRowKeyIndex = getPrevRowFocusRefIndex(
                keyMap,
                focusedRowIndex,
                focusedKeyIndex
              );
              const nextRowKeyIndex = getNextRowFocusRefIndex(
                keyMap,
                focusedRowIndex,
                focusedKeyIndex
              );

              let ref;
              if (isPrevRow && keyIndex === prevRowKeyIndex) {
                ref = prevRowRef;
              } else if (isNextRow && keyIndex === nextRowKeyIndex) {
                ref = nextRowRef;
              }

              return renderKey(key, rowIndex, keyIndex, ref);
            })}
          </KeyRow>
        );
      })}
      <KeyRow>
        <SpaceBar>
          {renderKey(SPACE_BAR_KEY, keyMap.rows.length, 0, getRefForLastRow(0))}
        </SpaceBar>
        <Button
          onPress={onBackspace}
          ref={getRefForLastRow(1)}
          onFocus={createOnFocusHandler(lastRowIndex, 1)}
        >
          <Icons.Backspace /> {appStrings.labelKeyboardDelete()}
        </Button>
      </KeyRow>
    </Keyboard>
  );
}
