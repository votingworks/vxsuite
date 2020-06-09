import React from 'react'
import styled from 'styled-components'

import { InputEventFunction } from '../config/types'

import {
  LabelButton,
  buttonFocusStyle,
  ButtonInterface as ButtonProps,
} from './Button'

const HiddenFileInput = styled.input`
  position: absolute;
  opacity: 0;
  z-index: -1;
  width: 0.1px;
  height: 0.1px;
  overflow: hidden;
  &:focus + label {
    ${buttonFocusStyle}
  }
  &:hover + label,
  &:active + label {
    outline: none;
  }
`

type HiddenFileInputProps = Parameters<typeof HiddenFileInput>[0]

interface Props {
  accept?: string
  buttonProps?: ButtonProps
  name?: string
  multiple?: boolean
  children: string
  id?: string
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

const FileInputButton = ({
  accept = '*/*',
  buttonProps,
  children,
  id,
  onChange,
  ...rest
}: Props) => {
  const onBlur: InputEventFunction = (event) => {
    const input = event.currentTarget
    input!.blur()
  }
  return (
    <React.Fragment>
      <HiddenFileInput
        {...rest}
        accept={accept}
        id={id}
        onBlur={onBlur}
        onChange={onChange}
        type="file"
      />
      <LabelButton htmlFor={id} {...buttonProps}>
        {children}
      </LabelButton>
    </React.Fragment>
  )
}

export default FileInputButton
