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
  const handleOnPress: PointerEventHandler = (event) => {
    /* istanbul ignore else */
    if (onPress) {
      onPress(event)
    } else if (goBack && !to) {
      history.goBack()
    } else if (to && !goBack) {
      history.push(to)
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
