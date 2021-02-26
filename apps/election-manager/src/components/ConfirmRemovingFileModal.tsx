import React, { useContext } from 'react'
import pluralize from 'pluralize'

import AppContext from '../contexts/AppContext'
import { ResultsFileType } from '../config/types'
import throwIllegalValue from '../utils/throwIllegalValue'

import Button from './Button'
import Prose from './Prose'
import Modal from './Modal'

export interface Props {
  onClose: () => void
  fileType: ResultsFileType
}

export const ConfirmRemovingFileModal: React.FC<Props> = ({
  onClose,
  fileType,
}) => {
  const {
    castVoteRecordFiles,
    saveCastVoteRecordFiles,
    saveExternalVoteRecordsFile,
    externalVoteRecordsFile,
  } = useContext(AppContext)

  const resetFiles = (fileType: ResultsFileType) => {
    switch (fileType) {
      case ResultsFileType.CastVoteRecord:
        saveCastVoteRecordFiles()
        break
      case ResultsFileType.SEMS:
        saveExternalVoteRecordsFile(undefined)
        break
      case ResultsFileType.All:
        saveCastVoteRecordFiles()
        saveExternalVoteRecordsFile(undefined)
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
      fileTypeName = 'External'
      mainContent = (
        <p>
          Do you want to remove the external results file{' '}
          {externalVoteRecordsFile!.name}?
        </p>
      )
      break
    }
    case ResultsFileType.All: {
      fileTypeName = ''
      singleFileRemoval = false
      const { fileList } = castVoteRecordFiles
      mainContent = (
        <React.Fragment>
          <p>
            Do you want to remove the {fileList.length} uploaded CVR{' '}
            {pluralize('files', fileList.length)}
            {externalVoteRecordsFile &&
              ` and the external results file ${externalVoteRecordsFile!.name}`}
            ?
          </p>
          <p>All reports will be unavailable without CVR data.</p>
        </React.Fragment>
      )
      break
    }
    default:
      throwIllegalValue(fileType)
  }

  return (
    <Modal
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
