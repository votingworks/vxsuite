import { useCallback, useEffect, useRef, useState } from 'react';
import styled, { DefaultTheme, StyledComponent } from 'styled-components';
import { Icons } from '../icons';
import { appStrings } from '../ui_strings';
import { SPACE_BAR_KEY } from './virtual_keyboard';
import { Key } from './common';
import { ScanPanelRow } from './scan_panels/scan_panel_row';
import { KeyButton } from './scan_panels/key_button';
import { ScanPanel, ScanPanelRenderOption } from './scan_panels/scan_panel';
import { Button, buttonStyles, gapStyles } from '../button';

const Keyboard = styled.div`
  display: flex;
  flex-wrap: wrap;

  & button {
    ${buttonStyles}
  }

  /* Overrides buttonStyles's justify-content.
   * https://styled-components.com/docs/faqs#how-can-i-override-styles-with-higher-specificity
  */
  && button {
    justify-content: space-between;
  }
`;

const SpaceBarDisplay = styled.span`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-grow: 1;
  border-right: 1px solid;
  border-color: ${(p) => p.theme.colors.outline};
  gap: ${(p) => gapStyles[p.theme.sizeMode]};
`;

const DeleteKey = styled.div`
  display: flex;

  & svg {
    margin-right: ${(p) => gapStyles[p.theme.sizeMode]};
  }
`;

const SpaceBarButton = styled.span`
  flex-grow: 1;

  && button {
    width: 100%;
    justify-content: center;
  }
`;

export interface ScanPanelVirtualKeyboardProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  keyDisabled(key: string): boolean;
  keyMap?: ScanPanelKeyMap;
}

interface KeyWithRenderSpec extends Key {
  renderWithComponent?: {
    button: StyledComponent<'span', DefaultTheme, object, never>;
    display: StyledComponent<'span', DefaultTheme, object, never>;
  };
}

interface ScanPanel {
  keys: KeyWithRenderSpec[];
}

interface ScanPanelKeyMap {
  rows: Array<ScanPanel[]>;
}

// NOTE: Although the letter keys here are rendered and spoken in English, the
// punctuation keys are spoken in the currently selected user language, if any,
// to improve comprehension for audio-only users.
//
// This assumes all current and future VxSuite supported languages have names
// for these punctuation symbols. We may need to update this logic if we find
// that to not be true for a language we add in the future.
export const US_ENGLISH_SCAN_PANEL_KEYMAP: ScanPanelKeyMap = {
  rows: [
    [
      {
        keys: [
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
        ],
      },
      {
        keys: [
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
        ],
      },
      {
        keys: [
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
      },
    ],
    [
      {
        keys: [
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
        ],
      },
      {
        keys: [
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
        ],
      },
      {
        keys: [
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
      },
    ],
    [
      {
        keys: [
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
        ],
      },
      {
        keys: [
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
        ],
      },
      {
        keys: [
          {
            value: ',',
            renderAudioString: () => appStrings.labelKeyboardComma(),
          },
          {
            value: '.',
            renderAudioString: () => appStrings.labelKeyboardPeriod(),
          },
          {
            value: '-',
            renderAudioString: () => appStrings.labelKeyboardHyphen(),
          },
        ],
      },
    ],
    [
      {
        keys: [
          {
            ...SPACE_BAR_KEY,
            renderWithComponent: {
              button: SpaceBarButton,
              display: SpaceBarDisplay,
            },
          },
          {
            value: 'delete',
            renderAudioString: () => appStrings.labelKeyboardDelete(),
            renderLabel: () => (
              <DeleteKey>
                <Icons.Backspace /> {appStrings.labelKeyboardDelete()}
              </DeleteKey>
            ),
          },
        ],
      },
    ],
  ],
};

enum SelectionLevel {
  Rows,
  ScanPanels,
  Keys,
}

export function ScanPanelVirtualKeyboard({
  onBackspace,
  onKeyPress,
  keyDisabled,
  keyMap = US_ENGLISH_SCAN_PANEL_KEYMAP,
}: ScanPanelVirtualKeyboardProps): JSX.Element {
  const [selectionLevel, setSelectionLevel] = useState<SelectionLevel>(
    SelectionLevel.Rows
  );
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(-1);
  const [selectedScanPanelIndex, setSelectedScanPanelIndex] =
    useState<number>(-1);

  const focusRef = useRef<HTMLButtonElement>(null);
  function getFocusRefForRow(rowIndex: number) {
    return selectionLevel === SelectionLevel.Rows && rowIndex === 0
      ? focusRef
      : undefined;
  }
  function getFocusRefForScanPanel(panelIndex: number) {
    return selectionLevel === SelectionLevel.ScanPanels && panelIndex === 0
      ? focusRef
      : undefined;
  }

  const keyButtonRef = useRef<Button<string>>(null);
  function getFocusRefForKeyButton(keyIndex: number) {
    return selectionLevel === SelectionLevel.Keys && keyIndex === 0
      ? keyButtonRef
      : undefined;
  }

  useEffect(() => {
    if (selectionLevel === SelectionLevel.Keys) {
      keyButtonRef.current?.focus();
    } else {
      focusRef.current?.focus();
    }
  }, [focusRef, selectionLevel]);

  function rowIsSelected(index: number) {
    return selectionLevel !== SelectionLevel.Rows && index === selectedRowIndex;
  }

  function scanPanelIsSelected(index: number) {
    return (
      selectionLevel === SelectionLevel.Keys && index === selectedScanPanelIndex
    );
  }

  function getScanPanelRenderOption(
    rowIndex: number,
    panelIndex: number
  ): ScanPanelRenderOption {
    // 3 cases:
    // 1. Render as enabled button (parent row selected, no scan panel selected)
    // 2. Render as disabled button (parent row selected, other scan panel in same row selected)
    // 3. Render as simple div container (row selected, this scan panel selected)
    if (rowIsSelected(rowIndex)) {
      const anyScanPanelIsSelected = selectionLevel === SelectionLevel.Keys;
      if (anyScanPanelIsSelected) {
        return scanPanelIsSelected(panelIndex)
          ? 'container'
          : 'button-disabled';
      }
      return 'button-enabled';
    }

    /* istanbul ignore next - scan panel is currently never rendered unless the parent row is selected */
    throw new Error(
      'Rendering a scan panel without its parent row selected is undefined behavior.'
    );
  }

  const resetFocusState = useCallback(() => {
    setSelectionLevel(SelectionLevel.Rows);
    setSelectedRowIndex(-1);
    setSelectedScanPanelIndex(-1);
  }, [setSelectionLevel, setSelectedRowIndex, setSelectedScanPanelIndex]);

  function onSelectRow(i: number) {
    setSelectionLevel(SelectionLevel.ScanPanels);
    setSelectedRowIndex(i);
    setSelectedScanPanelIndex(0);
  }

  function onSelectScanPanel(i: number) {
    setSelectionLevel(SelectionLevel.Keys);
    setSelectedScanPanelIndex(i);
  }

  // Handler for when a key (letter, punctuation, delete, etc) is selected
  function onSelectKey(key: string) {
    resetFocusState();

    if (key.toLowerCase() === 'delete') {
      onBackspace();
      return;
    }

    onKeyPress(key);
  }

  function renderKey(
    keySpec: KeyWithRenderSpec,
    keyIndex: number,
    rowIndex?: number,
    panelIndex?: number
  ) {
    const { value, renderWithComponent } = keySpec;
    const selectable =
      selectionLevel === SelectionLevel.Keys &&
      rowIndex !== undefined &&
      selectedRowIndex === rowIndex &&
      panelIndex !== undefined &&
      selectedScanPanelIndex === panelIndex;

    const keyComponent = (
      <KeyButton
        ref={getFocusRefForKeyButton(keyIndex)}
        key={value}
        keySpec={keySpec}
        onKeyPress={onSelectKey}
        disabled={keyDisabled(value)}
        selectable={selectable}
      />
    );

    if (renderWithComponent) {
      const Wrapper = selectable
        ? renderWithComponent.button
        : renderWithComponent.display;
      return <Wrapper key={value}>{keyComponent}</Wrapper>;
    }

    return keyComponent;
  }

  function renderFlatRow(row: ScanPanel[], rowIndex: number) {
    // Flatten a row of scan panels into a list of Key specs
    const keySpecs = row
      .map((panel) => panel.keys.map((keySpec) => keySpec))
      .reduce((acc, r) => acc.concat(r));

    // Render a Row of KeyButtons without the intermediate ScanPanels
    return (
      <ScanPanelRow
        ref={getFocusRefForRow(rowIndex)}
        onSelect={() => onSelectRow(rowIndex)}
        key={`row-${keySpecs.map((spec) => spec.value).join()}`}
        selectable={selectionLevel === SelectionLevel.Rows}
        selected={selectedRowIndex === rowIndex}
      >
        {keySpecs.map((keySpec, keyIndex) =>
          renderKey(keySpec, keyIndex, rowIndex)
        )}
      </ScanPanelRow>
    );
  }

  return (
    <Keyboard data-testid="virtual-keyboard">
      {keyMap.rows.map((row, rowIndex) => {
        if (rowIsSelected(rowIndex) && selectionLevel !== SelectionLevel.Rows) {
          const panels = row.map((panel, panelIndex) => (
            <ScanPanel
              ref={getFocusRefForScanPanel(panelIndex)}
              numKeys={panel.keys.length}
              key={panel.keys.map((k) => k.value).join()}
              renderAs={getScanPanelRenderOption(rowIndex, panelIndex)}
              onSelect={() => onSelectScanPanel(panelIndex)}
            >
              {panel.keys.map((keySpec, keyIndex) =>
                renderKey(keySpec, keyIndex, rowIndex, panelIndex)
              )}
            </ScanPanel>
          ));

          return (
            <ScanPanelRow
              key={`row-${row
                .map((panel) => panel.keys.map((k) => k.value).join())
                .join()}`}
              selectable={false}
              selected={selectedRowIndex === rowIndex}
            >
              {panels}
            </ScanPanelRow>
          );
        }

        return renderFlatRow(row, rowIndex);
      })}
    </Keyboard>
  );
}
