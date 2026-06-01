import React, { useCallback, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { Button } from './button';
import { Icons } from './icons';

export const NumberPadContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;

  > button {
    display: flex;
    justify-content: center;
    margin: 0.125rem;
    width: 26%;
  }
`;

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
export interface NumberPadProps {
  disabled?: boolean;
  onButtonPress: (buttonValue: number) => void;
  onBackspace: () => void;
  onClear: () => void;
  onEnter?: () => void;
}

export function NumberPad({
  disabled,
  onButtonPress,
  onBackspace,
  onClear,
  onEnter,
}: NumberPadProps): JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const onKeyPress: React.KeyboardEventHandler = useCallback(
    (event) => {
      if (disabled) {
        return;
      }
      if (DIGITS.includes(event.key)) {
        // eslint-disable-next-line vx/gts-safe-number-parse
        onButtonPress(Number(event.key));
      } else if (event.key === 'x') {
        onClear();
      } else if (onEnter !== undefined && event.key === 'Enter') {
        onEnter();
      }
    },
    [disabled, onButtonPress, onClear, onEnter]
  );
  const onKeyDown: React.KeyboardEventHandler = useCallback(
    (event) => {
      if (disabled) {
        return;
      }
      if (event.key === 'Backspace') {
        onBackspace();
      }
    },
    [disabled, onBackspace]
  );

  useEffect(() => {
    /* istanbul ignore next */
    container.current?.focus();
  }, []);

  return (
    <NumberPadContainer
      tabIndex={0}
      ref={container}
      onKeyPress={onKeyPress}
      onKeyDown={onKeyDown}
    >
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
        <Button
          disabled={disabled}
          key={digit}
          onPress={onButtonPress}
          value={digit}
        >
          {digit}
        </Button>
      ))}
      <Button disabled={disabled} onPress={onClear} aria-label="clear">
        <Icons.X />
      </Button>
      <Button disabled={disabled} onPress={onButtonPress} value={0}>
        0
      </Button>
      <Button disabled={disabled} onPress={onBackspace} aria-label="backspace">
        <Icons.Backspace />
      </Button>
    </NumberPadContainer>
  );
}
