import React from 'react'
import { RouteComponentProps, withRouter } from 'react-router'

import Button from '../components/Button'
import { ButtonEvent } from '../config/types'

interface Props
  extends React.PropsWithoutRef<JSX.IntrinsicElements['button']> {}
interface Props extends RouteComponentProps<{}> {}
interface Props {
  to: string
}

const LinkButton = (props: Props) => {
  const {
    history,
    location,
    match,
    staticContext,
    to,
    onClick,
    // ⬆ filtering out props that `button` doesn’t know what to do with.
    ...rest
  } = props
  const handleOnClick = (event: ButtonEvent) => {
    if (!props.disabled) {
      if (onClick) {
        onClick(event)
      }
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
