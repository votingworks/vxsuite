import React, { PointerEventHandler } from 'react'
import styled from 'styled-components'

import Button from './Button'

const Keyboard = styled.div`
  & div {
    display: flex;
    &:nth-child(2) {
      margin-right: 0;
      margin-left: 0.25rem;
      @media (min-width: 480px) {
        margin-right: 0;
        margin-left: 0.5rem;
      }
    }
    &:nth-child(3) {
      margin-right: 0.25rem;
      margin-left: 0.5rem;
      @media (min-width: 480px) {
        margin-right: 0.5rem;
        margin-left: 1rem;
      }
    }
  }
  & button {
    flex: 1;
    margin: 4px;
    box-sizing: content-box;
    background: #ffffff;
    padding: 2vw 0;
    white-space: nowrap;
    color: #000000;
    @media (min-width: 480px) {
      min-width: 1rem;
    }
    @media (min-width: 850px) {
      padding: 0.75rem 0;
    }

    &:disabled {
      color: #999999;
    }
  }
`

interface Props {
  onKeyPress: PointerEventHandler
  keyDisabled?(key: string): boolean
  keyMap?: KeyMap
}

interface Key {
  label: string
  ariaLabel?: string
}

interface KeyMap {
  rows: Key[][]
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
    [{ label: 'space' }, { label: '⌫ delete', ariaLabel: 'delete' }],
  ],
}

const VirtualKeyboard = ({
  onKeyPress,
  keyDisabled,
  keyMap = US_ENGLISH_KEYMAP,
}: Props) => (
  <Keyboard data-testid="virtual-keyboard">
    {keyMap.rows.map((row) => {
      return (
        <div key={`row-${row.map((key) => key.label).join()}`}>
          {row.map(({ label, ariaLabel }) => (
            <Button
              key={label}
              data-key={label}
              aria-label={ariaLabel ?? label.toLowerCase()}
              onPress={onKeyPress}
              disabled={keyDisabled?.(label)}
            >
              {label}
            </Button>
          ))}
        </div>
      )
    })}
  </Keyboard>
)

export default VirtualKeyboard
