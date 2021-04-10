import React, { useContext } from 'react'
import pluralize from 'pluralize'

import AppContext from '../contexts/AppContext'
import { ExternalTallySourceType, ResultsFileType } from '../config/types'
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
    saveExternalTallies,
    fullElectionExternalTallies,
  } = useContext(AppContext)

  const resetFiles = (fileType: ResultsFileType) => {
    switch (fileType) {
      case ResultsFileType.CastVoteRecord:
        saveCastVoteRecordFiles()
        break
      case ResultsFileType.SEMS: {
        const newFiles = fullElectionExternalTallies.filter(
          (tally) => tally.source !== ExternalTallySourceType.SEMS
        )
        saveExternalTallies(newFiles)
        break
      }
      case ResultsFileType.All:
        saveCastVoteRecordFiles()
        saveExternalTallies([])
        break
      default:
        throwIllegalValue(fileType)
    }
    onClose()
  }

  const externalFileNames = fullElectionExternalTallies
    .map((t) => t.inputSourceName)
    .join(', ')

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
          Do you want to remove the external results{' '}
          {pluralize('files', fullElectionExternalTallies.length)}{' '}
          {externalFileNames}?
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
            {fullElectionExternalTallies.length > 0 &&
              ` and the external results ${pluralize(
                'files',
                fileList.length
              )} ${externalFileNames}`}
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
