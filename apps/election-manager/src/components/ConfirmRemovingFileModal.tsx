import React, { useContext } from 'react'
import pluralize from 'pluralize'

import AppContext from '../contexts/AppContext'
import { ResultsFileType } from '../config/types'
import throwIllegalValue from '../utils/throwIllegalValue'

import Button from './Button'
import Prose from './Prose'
import Modal from './Modal'

export interface Props {
  isOpen: boolean
  onClose: () => void
  fileType: ResultsFileType
}

export const ConfirmRemovingFileModal: React.FC<Props> = ({
  isOpen,
  onClose,
  fileType,
}) => {
  const {
    castVoteRecordFiles,
    saveCastVoteRecordFiles,
    saveFullElectionExternalTally,
    fullElectionExternalTally,
  } = useContext(AppContext)

  const resetFiles = (fileType: ResultsFileType) => {
    switch (fileType) {
      case ResultsFileType.CastVoteRecord:
        saveCastVoteRecordFiles()
        break
      case ResultsFileType.SEMS:
        saveFullElectionExternalTally(undefined)
        break
      default:
        throwIllegalValue(fileType)
    }
    onClose()
  }

  let mainContent = null
  let fileTypeName = ''
  let singleFileRemoval = true
  switch (fileType) {
    case ResultsFileType.CastVoteRecord: {
      const { fileList } = castVoteRecordFiles
      singleFileRemoval = fileList.length <= 1
      fileTypeName = 'CVR'
      mainContent = (
        <React.Fragment>
          {fileList.length ? (
            <p>
              Do you want to remove the {fileList.length} uploaded CVR{' '}
              {pluralize('files', fileList.length)}?
            </p>
          ) : (
            <p>
              Do you want to remove the files causing errors:{' '}
              {castVoteRecordFiles.lastError?.filename}?
            </p>
          )}
          <p>All reports will be unavailable without CVR data.</p>
        </React.Fragment>
      )
      break
    }
    case ResultsFileType.SEMS: {
      const { file } = fullElectionExternalTally!
      fileTypeName = 'SEMS'
      mainContent = <p>Do you want to remove the SEMs file {file.name}?</p>
      break
    }
    default:
      throwIllegalValue(fileType)
  }

  return (
    <Modal
      isOpen={isOpen}
      centerContent
      content={<Prose textCenter>{mainContent}</Prose>}
      actions={
        <React.Fragment>
          <Button onPress={onClose}>Cancel</Button>
          <Button danger onPress={() => resetFiles(fileType)}>
            Remove {!singleFileRemoval && 'All'} {fileTypeName} Files
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  )
}
