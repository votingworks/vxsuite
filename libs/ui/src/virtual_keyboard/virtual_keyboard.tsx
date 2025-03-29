import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled, { DefaultTheme } from 'styled-components';

import { Button, ButtonProps } from '../button';
import { WithAltAudio, appStrings } from '../ui_strings';
import { ActionKey, Key } from './common';
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
    flex-grow: 1;

    &:disabled {
      border-width: ${getBorderWidthRem}rem;
    }
  }
`;

const KeyRow = styled.div`
  display: flex;
  gap: ${(p) => p.theme.sizes.minTouchAreaSeparationPx}px;
  margin-bottom: ${(p) => p.theme.sizes.minTouchAreaSeparationPx}px;
`;

const COLUMNS_IN_ROW = 12;
const DEFAULT_COLUMN_SPAN = 1;

export type RowDirection = 'previous-row' | 'next-row';

export interface VirtualKeyboardProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onCancel: () => void;
  onAccept: () => void;
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
  columnSpan: 8,
};

export const DELETE_KEY: Key = {
  value: 'delete',
  renderAudioString: () => appStrings.labelKeyboardDelete(),
  renderLabel: () => appStrings.labelKeyboardDelete(),
  columnSpan: 4,
  icon: 'Backspace',
  action: ActionKey.DELETE,
};

export const CANCEL_KEY: Key = {
  value: 'Cancel',
  renderAudioString: () => appStrings.buttonCancel(),
  renderLabel: () => appStrings.buttonCancel(),
  columnSpan: 3,
  action: ActionKey.CANCEL,
};

export const ACCEPT_KEY: Key = {
  value: 'Accept',
  renderAudioString: () => appStrings.buttonAccept(),
  renderLabel: () => appStrings.buttonAccept(),
  columnSpan: 3,
  icon: 'Done',
  action: ActionKey.ACCEPT,
};

function getAdjacentRowIndex(
  keyMap: KeyMap,
  focusedRowIndex: number,
  direction: -1 | 1
) {
  return (
    (focusedRowIndex + direction + keyMap.rows.length) % keyMap.rows.length
  );
}

function getPrevRowIndex(keyMap: KeyMap, focusedRowIndex: number) {
  return getAdjacentRowIndex(keyMap, focusedRowIndex, -1);
}

function getNextRowIndex(keyMap: KeyMap, focusedRowIndex: number) {
  return getAdjacentRowIndex(keyMap, focusedRowIndex, 1);
}

// For a row adjacent to the currently focused row, find the index of the keyboard button
// // that will be focused if the user navigates to that row. The target keyboard button
// is determined by the algorithm:
// 1. Find the currently focused keyboard button and compute its midpoint
// 2. In the adjacent row, calculate the closest edge (left or right) for each keyboard button
// 3. Choose the keyboard button with the closest edge
function getAdjacentRowTargetButtonIndex(
  keyMap: KeyMap,
  rowRefs: React.MutableRefObject<Array<HTMLDivElement | null>>,
  focusedRowIndex: number,
  direction: -1 | 1
) {
  // The first time the user interacts with the keyboard there is no focused key
  if (focusedRowIndex === -1) {
    return 0;
  }

  const focusedElement = document.activeElement;
  if (!focusedElement) {
    return 0;
  }

  const { x, width } = focusedElement.getBoundingClientRect();
  const targetX = Math.floor(x + width / 2); // Midpoint of button

  const adjacentRowIndex = getAdjacentRowIndex(
    keyMap,
    focusedRowIndex,
    direction
  );
  const adjacentRow = rowRefs.current[adjacentRowIndex];
  if (!adjacentRow) {
    return 0;
  }

  const adjacentRowKeys = Array.from(adjacentRow.querySelectorAll('button'));
  const closestEdges = adjacentRowKeys.map((button) => {
    const { x: currentX, width: currentWidth } = button.getBoundingClientRect();
    const leftEdge = currentX;
    const rightEdge = currentX + currentWidth;
    const leftEdgeDistance = Math.abs(leftEdge - targetX);
    const rightEdgeDistance = Math.abs(rightEdge - targetX);
    return Math.min(leftEdgeDistance, rightEdgeDistance);
  });

  return closestEdges.indexOf(Math.min(...closestEdges));
}

/**
 * Returns the index of the Key to focus if the user navigates to the previous row.
 * Index of the Key is relative to its parent row only (not to all keys on the keyboard).
 */
function getPrevRowTargetButtonIndex(
  keyMap: KeyMap,
  focusedRowIndex: number,
  rowRefs: React.MutableRefObject<Array<HTMLDivElement | null>>
) {
  return getAdjacentRowTargetButtonIndex(keyMap, rowRefs, focusedRowIndex, -1);
}

/**
 * Returns the index of the Key to focus if the user navigates to the next row.
 * Index of the Key is relative to its parent row only (not to all keys on the keyboard).
 */
function getNextRowTargetButtonIndex(
  keyMap: KeyMap,
  focusedRowIndex: number,
  rowRefs: React.MutableRefObject<Array<HTMLDivElement | null>>
) {
  return getAdjacentRowTargetButtonIndex(keyMap, rowRefs, focusedRowIndex, 1);
}

export function VirtualKeyboard({
  onBackspace,
  onKeyPress,
  onCancel,
  onAccept,
  keyDisabled,
  keyMap = US_ENGLISH_KEYMAP,
  enableWriteInAtiControllerNavigation,
}: VirtualKeyboardProps): JSX.Element {
  const [focusedRowIndex, setFocusedRowIndex] = useState(-1);

  const keyMapWithActions: KeyMap = useMemo(() => {
    const actions = enableWriteInAtiControllerNavigation
      ? [
          [SPACE_BAR_KEY, DELETE_KEY],
          [CANCEL_KEY, ACCEPT_KEY],
        ]
      : // Cancel and Accept keys are rendered outside this component when ATI Controller navigation is off
        [[SPACE_BAR_KEY, DELETE_KEY]];
    return {
      rows: [...keyMap.rows, ...actions],
    };
  }, [enableWriteInAtiControllerNavigation, keyMap.rows]);

  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

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
        case Keybinding.FOCUS_PREVIOUS: {
          const targetRowIndex = getPrevRowIndex(
            keyMapWithActions,
            focusedRowIndex
          );
          const targetKeyIndex = getPrevRowTargetButtonIndex(
            keyMapWithActions,
            focusedRowIndex,
            rowRefs
          );
          const targetRow = rowRefs.current[targetRowIndex];
          if (targetRow) {
            const buttons = Array.from(targetRow.querySelectorAll('button'));
            buttons[targetKeyIndex]?.focus();
            setFocusedRowIndex(targetRowIndex);
          }
          preventBrowserScroll(event);
          break;
        }
        case Keybinding.FOCUS_NEXT: {
          const targetRowIndex = getNextRowIndex(
            keyMapWithActions,
            focusedRowIndex
          );
          const targetKeyIndex = getNextRowTargetButtonIndex(
            keyMapWithActions,
            focusedRowIndex,
            rowRefs
          );
          const targetRow = rowRefs.current[targetRowIndex];
          if (targetRow) {
            const buttons = Array.from(targetRow.querySelectorAll('button'));
            buttons[targetKeyIndex]?.focus();
            setFocusedRowIndex(targetRowIndex);
          }
          preventBrowserScroll(event);
          break;
        }
        case Keybinding.SELECT:
          break;
        default:
          // Simultaneous use of PAT and ATI controller for write-ins is not supported, so no need
          // to define behavior for PAT-only key events
          break;
      }
    },
    [focusedRowIndex, keyMapWithActions]
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

  function getFlexBasis(columnSpan: number = DEFAULT_COLUMN_SPAN) {
    return `${(columnSpan / COLUMNS_IN_ROW) * 100}%`;
  }

  function renderKey(key: Key) {
    const {
      audioLanguageOverride,
      renderAudioString,
      value,
      renderLabel = () => value,
    } = key;
    const buttonProps: ButtonProps<string> = {
      value,
      onPress: onKeyPress,
      disabled: keyDisabled(value),
      style: {
        flexBasis: getFlexBasis(key.columnSpan),
      },
      icon: key.icon,
    };

    switch (key.action) {
      case ActionKey.DELETE:
        buttonProps.onPress = onBackspace;
        break;
      case ActionKey.ACCEPT:
        buttonProps.onPress = onAccept;
        break;
      case ActionKey.CANCEL:
        buttonProps.onPress = onCancel;
        break;
      default:
      // no override
    }

    const button = (
      <Button key={value} {...buttonProps}>
        <WithAltAudio
          audioLanguageOverride={audioLanguageOverride}
          audioText={renderAudioString()}
        >
          {renderLabel()}
        </WithAltAudio>
      </Button>
    );

    return button;
  }

  return (
    <Keyboard data-testid="virtual-keyboard">
      {keyMapWithActions.rows.map((row, rowIndex) => (
        <KeyRow
          ref={(element) => {
            rowRefs.current[rowIndex] = element;
          }}
          key={`row-${row.map((key) => key.value).join()}`}
        >
          {row.map(renderKey)}
        </KeyRow>
      ))}
    </Keyboard>
  );
}
