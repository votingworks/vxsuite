import styled, { DefaultTheme } from 'styled-components';
import { Button } from './button';
import { Icons } from './icons';

/* istanbul ignore next */
function getBorderWidthRem(p: { theme: DefaultTheme }): number {
  switch (p.theme.sizeMode) {
    case 'xl':
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
  label: string;
  ariaLabel?: string;
}

interface KeyMap {
  rows: Array<Key[]>;
}

const US_ENGLISH_KEYMAP: KeyMap = {
  rows: [
    [
      { label: 'Q' },
      { label: 'W' },
      { label: 'E' },
      { label: 'R' },
      { label: 'T' },
      { label: 'Y' },
      { label: 'U' },
      { label: 'I' },
      { label: 'O' },
      { label: 'P' },
    ],
    [
      { label: 'A' },
      { label: 'S' },
      { label: 'D' },
      { label: 'F' },
      { label: 'G' },
      { label: 'H' },
      { label: 'J' },
      { label: 'K' },
      { label: 'L' },
      { label: "'", ariaLabel: 'single-quote' },
      { label: '"', ariaLabel: 'double-quote' },
    ],
    [
      { label: 'Z' },
      { label: 'X' },
      { label: 'C' },
      { label: 'V' },
      { label: 'B' },
      { label: 'N' },
      { label: 'M' },
      { label: ',', ariaLabel: 'comma' },
      { label: '.', ariaLabel: 'period' },
      { label: '-', ariaLabel: 'dash' },
    ],
  ],
};

export function VirtualKeyboard({
  onBackspace,
  onKeyPress,
  keyDisabled,
  keyMap = US_ENGLISH_KEYMAP,
}: VirtualKeyboardProps): JSX.Element {
  return (
    <Keyboard data-testid="virtual-keyboard">
      {keyMap.rows.map((row) => {
        return (
          <KeyRow key={`row-${row.map((key) => key.label).join()}`}>
            {row.map(({ label, ariaLabel }) => (
              <Button
                key={label}
                value={label}
                aria-label={ariaLabel}
                onPress={onKeyPress}
                disabled={keyDisabled(label)}
              >
                {label}
              </Button>
            ))}
          </KeyRow>
        );
      })}
      <KeyRow>
        <SpaceBar>
          <Button disabled={keyDisabled(' ')} onPress={onKeyPress} value=" ">
            space
          </Button>
        </SpaceBar>
        <Button onPress={onBackspace}>
          <Icons.Backspace /> delete
        </Button>
      </KeyRow>
    </Keyboard>
  );
}
