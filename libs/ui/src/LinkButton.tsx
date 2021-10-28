import React from 'react';
import { useHistory } from 'react-router-dom';
import { EventTargetFunction } from '@votingworks/types';
import { Button, ButtonProps } from './Button';

export interface LinkButtonProps extends Omit<ButtonProps, 'onPress'> {
  goBack?: boolean;
  onPress?: EventTargetFunction;
  primary?: boolean;
  to?: string;
}

export default function LinkButton(props: LinkButtonProps): JSX.Element {
  const history = useHistory();
  const {
    goBack,
    onPress,
    to,
    // ⬆ filtering out props which are not intrinsic to `<button>` element.
    ...rest
  } = props;
  const handleOnPress: EventTargetFunction = (event) => {
    /* istanbul ignore else */
    if (onPress) {
      onPress(event);
    } else if (goBack && !to) {
      history.goBack();
    } else if (to && !goBack) {
      history.push(to);
    }
  };
  return (
    <Button
      {...rest} // `children` is just another prop!
      role="option"
      onPress={handleOnPress}
    />
  );
}
