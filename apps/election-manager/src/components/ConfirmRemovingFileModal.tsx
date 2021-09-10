import React, { useContext } from 'react'
import pluralize from 'pluralize'

import { throwIllegalValue } from '@votingworks/utils'
import { strict as assert } from 'assert'
import { ExternalTallySourceType } from '@votingworks/types'
import AppContext from '../contexts/AppContext'
import { ResultsFileType } from '../config/types'

import Button from './Button'
import Prose from './Prose'
import Modal from './Modal'

export interface Props {
  onConfirm: (fileType: ResultsFileType) => void
  onCancel: () => void
  fileType: ResultsFileType
}

export const ConfirmRemovingFileModal = ({
  onConfirm,
  onCancel,
  fileType,
}: Props): JSX.Element => {
  const { castVoteRecordFiles, fullElectionExternalTallies } = useContext(
    AppContext
  )

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
      assert(semsFile)
      fileTypeName = 'External Files'
      mainContent = (
        <p>
          Do you want to remove the external results{' '}
          {pluralize('files', fullElectionExternalTallies.length)}{' '}
          {semsFile.inputSourceName}?
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
          <Button onPress={onCancel}>Cancel</Button>
          <Button danger onPress={() => onConfirm(fileType)}>
            Remove {!singleFileRemoval && 'All'} {fileTypeName}
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onCancel}
    />
  )
}
