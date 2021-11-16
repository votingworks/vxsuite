import React from 'react';
import { useHistory } from 'react-router-dom';
import { EventTargetFunction } from '../config/types';

import { Button, ButtonInterface } from './button';

interface Props
  extends ButtonInterface,
    React.PropsWithoutRef<JSX.IntrinsicElements['button']> {
  goBack?: boolean;
  onPress?: EventTargetFunction;
  primary?: boolean;
  to?: string;
}

export function LinkButton(props: Props): JSX.Element {
  const {
    goBack,
    onPress,
    to,
    // ⬆ filtering out props which are not intrinsic to `<button>` element.
    ...rest
  } = props;
  const history = useHistory();
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
