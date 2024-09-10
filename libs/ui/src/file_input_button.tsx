import { ChangeEvent, FormEvent, RefObject } from 'react';
import styled from 'styled-components';
import { LabelButton, ButtonProps } from './button';

const LabelButtonContainer = styled(LabelButton)`
  position: relative;

  &:focus-within {
    outline: var(--focus-outline);
  }
`;

const HiddenFileInput = styled.input`
  position: absolute;
  opacity: 0;
  z-index: -1;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  cursor: pointer;

  &[disabled] {
    cursor: not-allowed;
  }
`;

export interface FileInputButtonProps {
  accept?: string;
  buttonProps?: Omit<ButtonProps, 'onPress'>;
  disabled?: boolean;
  name?: string;
  multiple?: boolean;
  children: React.ReactNode;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
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
}: FileInputButtonProps): JSX.Element {
  function onBlur(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    /* istanbul ignore next */
    input?.blur();
  }
  return (
    <LabelButtonContainer {...buttonProps} disabled={disabled}>
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
    </LabelButtonContainer>
  );
}
