import { FunctionalComponent, h } from 'preact'
import { RootAction } from '../../types/actions'
import Group from './group'
import Landmark from './landmark'
import * as style from './style.css'

export interface Props {
  actions: readonly RootAction[]
}

const Overlay: FunctionalComponent<Props> = ({ actions }) => {
  return (
    <div>
      {actions.map(action =>
        action.kind === 'landmark' ? (
          <Landmark action={action} />
        ) : action.kind === 'group' ? (
          <Group action={action} />
        ) : (
          undefined
        )
      )}
    </div>
  )
}

export default Overlay
