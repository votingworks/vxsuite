import React from 'react';
import { useHistory } from 'react-router-dom';
import { Button, ButtonProps } from './button';

/**
 * Props for {@link LinkButton}.
 */
export interface LinkButtonProps extends Omit<ButtonProps, 'onPress'> {
  goBack?: boolean;
  primary?: boolean;
  to?: string;
}

/**
 * Renders a button that updates navigation, or calls `onPress`.
 */
export function LinkButton(props: LinkButtonProps): JSX.Element {
  const history = useHistory();
  const {
    goBack,
    to,
    // ⬆ filtering out props which are not intrinsic to `<button>` element.
    ...rest
  } = props;
  function handleOnPress() {
    /* istanbul ignore else */
    if (goBack && !to) {
      history.goBack();
    } else if (to && !goBack) {
      history.push(to);
    }
  }
  return (
    <Button
      {...rest} // `children` is just another prop!
      onPress={handleOnPress}
    />
  );
}
