import React, { useContext } from 'react'
import { useHistory } from 'react-router-dom'

import AppContext from '../contexts/AppContext'
import routerPaths from '../routerPaths'
import Modal from './Modal'
import Prose from './Prose'
import Button from './Button'

export interface Props {
  onClose: () => void
}

const RemoveElectionModal: React.FC<Props> = ({ onClose }) => {
  const history = useHistory()
  const { saveElection } = useContext(AppContext)

  const unconfigureElection = () => {
    saveElection(undefined)
    history.push(routerPaths.root)
  }

  return (
    <Modal
      centerContent
      content={
        <Prose textCenter>
          <p>Do you want to remove the current election definition?</p>
          <p>All data will be removed from this app.</p>
        </Prose>
      }
      onOverlayClick={onClose}
      actions={
        <React.Fragment>
          <Button onPress={onClose}>Cancel</Button>
          <Button danger onPress={unconfigureElection}>
            Remove Election Definition
          </Button>
        </React.Fragment>
      }
    />
  )
}

export default RemoveElectionModal
