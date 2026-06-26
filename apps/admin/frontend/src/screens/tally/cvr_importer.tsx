import { useContext } from 'react';

import {
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import type {
  CastVoteRecordFileRecord as CvrImport,
  CastVoteRecordFileMetadata as CvrExport,
  CvrFileImportInfo,
  ImportCastVoteRecordsError,
  CvrFileMode,
} from '@votingworks/admin-backend';
import { Button } from '@votingworks/ui';

import { AppContext } from '../../contexts/app_context';
import * as api from '../../api';

export type ImportFn = (p: { path: string }) => void;

export type CvrImporter =
  | {
      state: 'duplicate';
      existingImports: ExistingImports;
      result: CvrFileImportInfo;
      usbExports: CvrExport[];
    }
  | {
      state: 'error';
      errorMessage?: string;
      existingImports: ExistingImports;
      filename: string;
      usbExports: CvrExport[];
    }
  | {
      state: 'importing';
      existingImports: ExistingImports;
      usbExports: CvrExport[];
    }
  | {
      state: 'init';
      existingImports: ExistingImports;
      import: ImportFn;
      manualImportButton: React.ReactNode;
      usbExports: CvrExport[];
    }
  | {
      state: 'loading';
    }
  | {
      state: 'noUsb';
      manualImportButton: React.ReactNode;
    }
  | {
      state: 'success';
      existingImports: ExistingImports;
      import: ImportFn;
      manualImportButton: React.ReactNode;
      result: CvrFileImportInfo;
      usbExports: CvrExport[];
    };

export interface ExistingImports {
  imports: CvrImport[];
  mode: CvrFileMode;
}

export function useCvrImporter(): CvrImporter {
  const { usbDriveStatus, electionDefinition, auth } = useContext(AppContext);

  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth));

  const imports = api.getCastVoteRecordFiles.useQuery();
  const cvrMode = api.getCastVoteRecordFileMode.useQuery();
  const usbExports = api.listCastVoteRecordFilesOnUsb.useQuery(usbDriveStatus);

  const importMutation = api.addCastVoteRecordFile.useMutation();

  if (
    usbDriveStatus.status === 'no_drive' ||
    usbDriveStatus.status === 'ejected' ||
    usbDriveStatus.status === 'error'
  ) {
    return {
      state: 'noUsb',
      manualImportButton: manualImportButton(importMutation.mutate),
    };
  }

  if (!imports.isSuccess || !cvrMode.isSuccess || !usbExports.isSuccess) {
    return { state: 'loading' };
  }

  const existingImports: ExistingImports = {
    imports: imports.data,
    mode: cvrMode.data,
  };

  if (importMutation.status === 'loading') {
    return {
      state: 'importing',
      existingImports,
      usbExports: usbExports.data,
    };
  }

  if (importMutation.status === 'success') {
    if (importMutation.data.isErr()) {
      return {
        state: 'error',
        errorMessage: errorMessage(importMutation.data.err()),
        existingImports,
        filename: assertDefined(importMutation.variables).path,
        usbExports: usbExports.data,
      };
    }

    const result = importMutation.data.ok();

    if (result.wasExistingFile) {
      return {
        state: 'duplicate',
        existingImports,
        result,
        usbExports: usbExports.data,
      };
    }

    return {
      state: 'success',
      existingImports,
      import: importMutation.mutate,
      manualImportButton: manualImportButton(importMutation.mutate),
      result,
      usbExports: usbExports.data,
    };
  }

  return {
    state: 'init',
    existingImports,
    import: importMutation.mutate,
    manualImportButton: manualImportButton(importMutation.mutate),
    usbExports: usbExports.data,
  };
}

function manualImportButton(importFn: ImportFn) {
  return (
    window.kiosk && (
      <Button
        onPress={async () => {
          const kiosk = assertDefined(window.kiosk);
          const dialogResult = await kiosk.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: '', extensions: ['json'] }],
          });

          if (dialogResult.canceled) return;

          const path = dialogResult.filePaths[0];
          if (path) importFn({ path });
        }}
      >
        Select CVR Export Manually…
      </Button>
    )
  );
}

function errorMessage(err: ImportCastVoteRecordsError): string {
  switch (err.type) {
    case 'authentication-error': {
      return (
        'Unable to authenticate cast vote records. Try exporting them' +
        'from the scanner again.'
      );
    }

    case 'ballot-id-already-exists-with-different-data': {
      return (
        `Found a cast vote record at index ${err.index} that has the` +
        'same ballot ID as a previously imported cast vote record, but with ' +
        'different data.'
      );
    }

    case 'invalid-mode': {
      return {
        official:
          'You are currently tabulating official results but the selected ' +
          'cast vote record export contains test results.',

        test:
          'You are currently tabulating test results but the selected ' +
          'cast vote record export contains official results.',
      }[err.currentMode];
    }

    case 'invalid-cast-vote-record': {
      const msgBase = `Found an invalid cast vote record at index ${err.index}.`;
      const msgDetail = (() => {
        switch (err.subType) {
          case 'ballot-style-not-found': {
            return 'The record references a ballot style that does not exist.';
          }
          case 'batch-id-not-found': {
            return 'The record references a batch ID that does not exist.';
          }
          case 'contest-not-found': {
            return 'The record references a contest that does not exist.';
          }
          case 'contest-option-not-found': {
            return 'The record references a contest option that does not exist.';
          }
          case 'election-mismatch': {
            return 'The record references the wrong election.';
          }
          case 'image-not-found': {
            return 'The record references an image that does not exist.';
          }
          case 'image-read-error': {
            return 'The record references an image that could not be read.';
          }
          case 'incorrect-image-hash': {
            return 'The record references an image with an incorrect hash.';
          }
          case 'incorrect-layout-file-hash': {
            return 'The record references a layout file with an incorrect hash.';
          }
          case 'invalid-ballot-image-field': {
            return 'The record contains an incorrectly formatted ballot image field.';
          }
          case 'invalid-ballot-sheet-id': {
            return 'The record contains an incorrectly formatted ballot sheet ID.';
          }
          case 'invalid-write-in-field': {
            return 'The record contains an incorrectly formatted write-in field.';
          }
          case 'layout-file-not-found': {
            return 'The record references a layout file that does not exist.';
          }
          case 'layout-file-parse-error': {
            return 'The record references a layout file that could not be parsed.';
          }
          case 'layout-file-read-error': {
            return 'The record references a layout file that could not be read.';
          }
          case 'no-current-snapshot': {
            return (
              'The record does not contain a current snapshot of the ' +
              'interpreted results.'
            );
          }
          case 'no-original-snapshot': {
            return 'The record does not contain the original snapshot of the results.';
          }
          case 'parse-error': {
            return 'The record could not be parsed.';
          }
          case 'precinct-not-found': {
            return 'The record references a precinct that does not exist.';
          }

          /* istanbul ignore next */
          default: {
            throwIllegalValue(err, 'subType');
          }
        }
      })();
      return [msgBase, msgDetail].join(' ');
    }

    case 'metadata-file-not-found': {
      return 'Unable to find metadata file.';
    }

    case 'metadata-file-parse-error': {
      return 'Unable to parse metadata file.';
    }

    /* istanbul ignore next */
    default: {
      throwIllegalValue(err, 'type');
    }
  }
}
