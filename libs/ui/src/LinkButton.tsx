import React from 'react';
import { RouteComponentProps, withRouter } from 'react-router-dom';
import { EventTargetFunction } from '@votingworks/types';
import { Button, ButtonProps } from './Button';

export interface LinkButtonProps
  extends Omit<ButtonProps, 'onPress'>,
    RouteComponentProps<Record<string, string | undefined>> {
  goBack?: boolean;
  onPress?: EventTargetFunction;
  primary?: boolean;
  to?: string;
}

function LinkButton(props: LinkButtonProps): JSX.Element {
  const {
    goBack,
    history,
    location, // eslint-disable-line @typescript-eslint/no-unused-vars
    match, // eslint-disable-line @typescript-eslint/no-unused-vars
    onPress,
    staticContext, // eslint-disable-line @typescript-eslint/no-unused-vars
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

export default withRouter(LinkButton);
