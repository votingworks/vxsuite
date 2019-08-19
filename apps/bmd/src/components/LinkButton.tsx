import React, { PointerEventHandler } from 'react'
import { RouteComponentProps, withRouter } from 'react-router-dom'

import Button, { ButtonInterface } from './Button'

interface Props
  extends ButtonInterface,
    RouteComponentProps<{}>,
    React.PropsWithoutRef<JSX.IntrinsicElements['button']> {}

interface Props {
  goBack?: boolean
  onPress?: PointerEventHandler
  primary?: boolean
  to?: string
}

const LinkButton = (props: Props) => {
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
  } = props
  const handleOnPress: PointerEventHandler = event => {
    /* istanbul ignore else */
    if (onPress) {
      onPress(event)
    } else if (goBack && !to) {
      // Delay to avoid passing tap to next screen
      window.setTimeout(() => {
        history.goBack()
      }, 100)
    } else if (to && !goBack) {
      // Delay to avoid passing tap to next screen
      window.setTimeout(() => {
        history.push(to)
      }, 100)
    }
  }
  return (
    <Button
      {...rest} // `children` is just another prop!
      role="option"
      onPress={handleOnPress}
    />
  )
}

export default withRouter(LinkButton)
