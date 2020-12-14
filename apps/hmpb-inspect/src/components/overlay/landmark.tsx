import { FunctionalComponent, h } from 'preact'
import * as actions from '../../types/actions'
import { positioning } from '../../util/style'
import * as style from './style.css'

export interface Props {
  action: actions.Landmark
}

const Landmark: FunctionalComponent<Props> = ({ action }) => {
  return <div class={style.landmark} style={positioning(action.bounds)} />
}

export default Landmark
