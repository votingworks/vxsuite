import React, { RefObject } from 'react';
import styled from 'styled-components';

import {
  LabelButton,
  ButtonInterface as ButtonProps,
} from '@votingworks/shared-frontend';

import { InputEventFunction } from '../config/types';

const HiddenFileInput = styled.input`
  position: relative;
  opacity: 0;
  z-index: -1;
  width: 0.1px;
  height: 0.1px;
  overflow: hidden;
  &:focus + label {
    outline: none;
  }
  &:hover + label,
  &:active + label {
    outline: none;
  }
`;

interface Props {
  accept?: string;
  buttonProps?: ButtonProps;
  disabled?: boolean;
  name?: string;
  multiple?: boolean;
  children: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  innerRef?: RefObject<HTMLInputElement>;
}

export function FileInputButton({
  accept = '*/*',
  buttonProps,
  children,
  disabled,
  onChange,
  innerRef,
  ...rest
}: Props): JSX.Element {
  const onBlur: InputEventFunction = (event) => {
    const input = event.currentTarget;
    input?.blur();
  };
  return (
    <LabelButton {...buttonProps} disabled={disabled}>
      <HiddenFileInput
        {...rest}
        accept={accept}
        disabled={disabled}
        onBlur={onBlur}
        onChange={onChange}
        ref={innerRef}
        type="file"
      />
      {children}
    </LabelButton>
  );
}
