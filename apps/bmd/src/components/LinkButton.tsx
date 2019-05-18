import React from 'react'
import { RouteComponentProps, withRouter } from 'react-router-dom'

import Button, { ButtonInterface } from './Button'
import { ButtonEvent } from '../config/types'

interface Props
  extends ButtonInterface,
    RouteComponentProps<{}>,
    React.PropsWithoutRef<JSX.IntrinsicElements['button']> {}

interface Props {
  goBack?: boolean
  primary?: boolean
  to?: string
}

const LinkButton = (props: Props) => {
  const {
    goBack,
    history,
    location, // eslint-disable-line @typescript-eslint/no-unused-vars
    match, // eslint-disable-line @typescript-eslint/no-unused-vars
    onClick,
    staticContext, // eslint-disable-line @typescript-eslint/no-unused-vars
    to,
    // ⬆ filtering out props that `button` doesn’t know what to do with.
    ...rest
  } = props
  const handleOnClick = (event: ButtonEvent) => {
    if (onClick) {
      onClick(event)
    }
    if (goBack && !to) {
      history.goBack()
    }
    if (to && !goBack) {
      history.push(to)
    }
  }
  return (
    <Button
      {...rest} // `children` is just another prop!
      onClick={handleOnClick}
    />
  )
}

export default withRouter(LinkButton)
