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
      case ResultsFileType.Manual: {
        const newFiles = fullElectionExternalTallies.filter(
          (tally) => tally.source !== ExternalTallySourceType.Manual
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

  const semsFile = fullElectionExternalTallies.find(
    (t) => t.source === ExternalTallySourceType.SEMS
  )
  const manualData = fullElectionExternalTallies.find(
    (t) => t.source === ExternalTallySourceType.Manual
  )

  let mainContent = null
  let fileTypeName = ''
  let singleFileRemoval = true
  switch (fileType) {
    case ResultsFileType.CastVoteRecord: {
      const { fileList } = castVoteRecordFiles
      singleFileRemoval = fileList.length <= 1
      fileTypeName = 'CVR Files'
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
      fileTypeName = 'External Files'
      mainContent = (
        <p>
          Do you want to remove the external results{' '}
          {pluralize('files', fullElectionExternalTallies.length)}{' '}
          {semsFile!.inputSourceName}?
        </p>
      )
      break
    }
    case ResultsFileType.Manual: {
      fileTypeName = 'Manual Data'
      mainContent = <p>Do you want to remove the manually entered data?</p>
      break
    }
    case ResultsFileType.All: {
      fileTypeName = 'Data'
      singleFileRemoval = false
      const { fileList } = castVoteRecordFiles
      let externalDetails = ''
      if (semsFile !== undefined && manualData !== undefined) {
        externalDetails = `, the external results file ${semsFile.inputSourceName}, and the manually entered data`
      } else if (semsFile !== undefined) {
        externalDetails = ` and the external results file ${semsFile.inputSourceName}`
      } else if (manualData !== undefined) {
        externalDetails = ' and the manually entered data'
      }
      mainContent = (
        <React.Fragment>
          <p>
            Do you want to remove the {fileList.length} uploaded CVR{' '}
            {pluralize('files', fileList.length)}
            {externalDetails}?
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
            Remove {!singleFileRemoval && 'All'} {fileTypeName}
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  )
}
