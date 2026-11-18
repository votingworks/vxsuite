import fileDownload from 'js-file-download';
import React, { useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  BallotStyleIdSchema,
  ElectionIdSchema,
  PrecinctIdSchema,
  unsafeParse,
} from '@votingworks/types';
import { z } from 'zod/v4';
import type { BallotPreviewPdf } from '@votingworks/hmpb';
import { Button } from '@votingworks/ui';
import { BallotViewer } from '@votingworks/election-definition-ui';
import { getBallotTemplate } from './api.js';
import { routes } from './routes.js';

function BallotPreviewActions({
  preview,
}: {
  preview?: BallotPreviewPdf;
}): JSX.Element {
  const printIframeRef = useRef<HTMLIFrameElement>(null);

  const pdfFile = useMemo(() => {
    if (!preview) return;
    const blob = new Blob([new Uint8Array(preview.pdfData)], {
      type: 'application/pdf',
    });
    return URL.createObjectURL(blob);
  }, [preview]);

  useEffect(() => {
    if (!pdfFile) return;
    return () => URL.revokeObjectURL(pdfFile);
  }, [pdfFile]);

  // @coverage-defer
  function onDownloadPdfPressed() {
    if (!preview) return;
    fileDownload(preview.pdfData, preview.fileName, 'application/pdf');
  }

  // @coverage-defer
  function onPrintPdfPressed() {
    printIframeRef.current?.contentWindow?.print();
  }

  return (
    <React.Fragment>
      {pdfFile && (
        <iframe
          ref={printIframeRef}
          src={pdfFile}
          title="Print PDF"
          style={{ display: 'none' }}
        />
      )}
      <Button
        icon="Export"
        variant="inverseNeutral"
        onPress={onDownloadPdfPressed}
        disabled={!pdfFile}
      >
        Download PDF
      </Button>
      <Button
        icon="Print"
        variant="inverseNeutral"
        onPress={onPrintPdfPressed}
        disabled={!pdfFile}
      >
        Print
      </Button>
    </React.Fragment>
  );
}

export function BallotScreen(): JSX.Element | null {
  const params = useParams<{
    electionId: string;
    ballotStyleId: string;
    precinctId: string;
  }>();
  const { electionId, ballotStyleId, precinctId } = unsafeParse(
    z.object({
      electionId: ElectionIdSchema,
      ballotStyleId: BallotStyleIdSchema,
      precinctId: PrecinctIdSchema,
    }),
    params
  );
  const getBallotTemplateQuery = getBallotTemplate.useQuery(electionId);

  if (!getBallotTemplateQuery.isSuccess) {
    return null;
  }

  const electionRoutes = routes.election(electionId);
  return (
    <BallotViewer
      electionId={electionId}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      ballotTemplateId={getBallotTemplateQuery.data}
      closePath={electionRoutes.ballots.root.path}
      electionInfoPath={electionRoutes.electionInfo.root.path}
      renderActions={({ preview }) => (
        <BallotPreviewActions preview={preview} />
      )}
    />
  );
}
