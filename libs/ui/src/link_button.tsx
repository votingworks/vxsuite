import { useHistory } from 'react-router-dom';
import { forwardRef, Ref } from 'react';
import { Button, ButtonProps, ClickHandler } from './button';

/**
 * Props for {@link LinkButton}.
 */
export interface LinkButtonProps extends Omit<ButtonProps, 'onPress'> {
  goBack?: boolean;
  primary?: boolean;
  to?: string;
  ref?: Ref<Button<never>>;
}

/**
 * Renders a button that updates navigation, or calls `onPress`.
 */
// eslint-disable-next-line react/display-name
export const LinkButton = forwardRef(
  (props: LinkButtonProps, ref: Ref<Button<never>>): JSX.Element => {
    const history = useHistory();
    const {
      goBack,
      to,
      // ⬆ filtering out props which are not intrinsic to `<button>` element.
      ...rest
    } = props;
    const handleOnPress: ClickHandler = () => {
      /* istanbul ignore else */
      if (goBack && !to) {
        history.goBack();
      } else if (to && !goBack) {
        history.push(to);
      }
    };
    return (
      <Button<never>
        {...rest} // `children` is just another prop!
        onPress={handleOnPress}
        ref={ref}
      />
    );
  }
);
