import React, { useContext } from 'react';
import pluralize from 'pluralize';

import { throwIllegalValue } from '@votingworks/basics';
import { Modal, Prose, Button } from '@votingworks/ui';
import { ExternalTallySourceType } from '@votingworks/types';
import { AppContext } from '../contexts/app_context';
import { ResultsFileType } from '../config/types';
import { useCvrFilesQuery } from '../hooks/use_cvr_files_query';
import { Loading } from './loading';

export interface Props {
  onConfirm: (fileType: ResultsFileType) => void;
  onCancel: () => void;
  fileType: ResultsFileType;
}

export function ConfirmRemovingFileModal({
  onConfirm,
  onCancel,
  fileType,
}: Props): JSX.Element {
  const { fullElectionExternalTallies } = useContext(AppContext);

  const manualData = fullElectionExternalTallies.get(
    ExternalTallySourceType.Manual
  );

  const cvrFilesQuery = useCvrFilesQuery();

  const isLoading =
    (fileType === ResultsFileType.CastVoteRecord ||
      fileType === ResultsFileType.All) &&
    cvrFilesQuery.isLoading;

  let mainContent: React.ReactNode = null;
  let fileTypeName = '';
  let singleFileRemoval = true;
  switch (fileType) {
    case ResultsFileType.CastVoteRecord: {
      if (isLoading) {
        return <Loading />;
      }

      const fileList =
        cvrFilesQuery.isLoading || cvrFilesQuery.isError
          ? []
          : cvrFilesQuery.data;
      singleFileRemoval = fileList.length <= 1;
      fileTypeName = 'CVR Files';
      mainContent = (
        <React.Fragment>
          <p>
            Do you want to remove the {fileList.length} loaded CVR{' '}
            {pluralize('files', fileList.length)}?
          </p>
          <p>All reports will be unavailable without CVR data.</p>
        </React.Fragment>
      );
      break;
    }
    case ResultsFileType.Manual: {
      fileTypeName = 'Manual Data';
      mainContent = <p>Do you want to remove the manually entered data?</p>;
      break;
    }
    case ResultsFileType.All: {
      if (isLoading) {
        return <Loading />;
      }

      fileTypeName = 'Data';
      singleFileRemoval = false;
      const fileList =
        cvrFilesQuery.isLoading || cvrFilesQuery.isError
          ? []
          : cvrFilesQuery.data;
      mainContent = (
        <React.Fragment>
          <p>
            Do you want to remove the {fileList.length} loaded CVR{' '}
            {pluralize('files', fileList.length)}
            {manualData !== undefined && ' and the manually entered data'}?
          </p>
          <p>All reports will be unavailable without CVR data.</p>
        </React.Fragment>
      );
      break;
    }
    default:
      throwIllegalValue(fileType);
  }

  return (
    <Modal
      centerContent
      content={<Prose textCenter>{mainContent}</Prose>}
      actions={
        <React.Fragment>
          <Button
            variant="danger"
            disabled={isLoading}
            onPress={() => onConfirm(fileType)}
          >
            Remove {!singleFileRemoval && 'All'} {fileTypeName}
          </Button>
          <Button onPress={onCancel}>Cancel</Button>
        </React.Fragment>
      }
      onOverlayClick={onCancel}
    />
  );
}
