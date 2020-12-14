import { FunctionalComponent, h } from 'preact'
import Overlay from '.'
import * as actions from '../../types/actions'
import * as style from './style.css'

export interface Props {
  action: actions.Group
}

const Group: FunctionalComponent<Props> = ({ action }) => {
  return (
    <div class={style.group}>
      <Overlay actions={action.actions} />
    </div>
  )
}

export default Group
