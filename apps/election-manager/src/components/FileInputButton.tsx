import React from 'react'
import styled from 'styled-components'

import { InputEventFunction } from '../config/types'

import {
  LabelButton,
  buttonFocusStyle,
  ButtonInterface as ButtonProps,
} from './Button'

const HiddenFileInput = styled.input`
  position: relative;
  opacity: 0;
  z-index: -1;
  width: 0.1px;
  height: 0.1px;
  overflow: hidden;
  &:focus + label {
    ${buttonFocusStyle}/* stylelint-disable-line value-keyword-case */
  }
  &:hover + label,
  &:active + label {
    outline: none;
  }
`

interface Props {
  accept?: string
  buttonProps?: ButtonProps
  disabled?: boolean
  name?: string
  multiple?: boolean
  children: string
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

const FileInputButton: React.FC<Props> = ({
  accept = '*/*',
  buttonProps,
  children,
  disabled,
  onChange,
  ...rest
}) => {
  const onBlur: InputEventFunction = (event) => {
    const input = event.currentTarget
    input!.blur()
  }
  return (
    <React.Fragment>
      <LabelButton {...buttonProps} disabled={disabled}>
        <HiddenFileInput
          {...rest}
          accept={accept}
          disabled={disabled}
          onBlur={onBlur}
          onChange={onChange}
          type="file"
        />
        {children}
      </LabelButton>
    </React.Fragment>
  )
}

export default FileInputButton
