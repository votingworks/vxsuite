import React from 'react';
import {
  BallotHashSlot,
  Box,
  DualLanguageText,
  QrCodeSlot,
} from '../ballot_components';
import { hmpbStrings } from '../hmpb_strings';
import { ArrowRightCircle } from '../svg_assets';
import { RenderDocument } from '../renderer';

function FooterMetadataContent({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}): JSX.Element {
  return (
    <>
      {label}: <b>{value}</b>
    </>
  );
}

function FooterMetadata(props: {
  label: string;
  value: React.ReactNode;
}): JSX.Element {
  return (
    <span>
      <FooterMetadataContent {...props} />
    </span>
  );
}

const FOOTER_SLOT_CLASS = 'footer-slot';

export async function injectFooterMetadata(
  document: RenderDocument,
  metadata: Record<string, React.ReactNode>
): Promise<void> {
  await document.setContent(
    `.${FOOTER_SLOT_CLASS}`,
    <React.Fragment>
      {Object.entries(metadata).map(([key, value]) => (
        <FooterMetadata key={key} label={key} value={value} />
      ))}
    </React.Fragment>
  );
}

export function Footer({
  pageNumber,
  totalPages,
}: {
  pageNumber: number;
  totalPages?: number;
}): JSX.Element {
  const continueVoting = (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
      }}
    >
      <div style={{ textAlign: 'right' }}>
        <DualLanguageText>
          <h3>
            {pageNumber % 2 === 1
              ? hmpbStrings.hmpbContinueVotingOnBack
              : hmpbStrings.hmpbContinueVotingOnNextSheet}
          </h3>
        </DualLanguageText>
      </div>
      <ArrowRightCircle style={{ height: '2rem' }} />
    </div>
  );
  const ballotComplete = (
    <div style={{ textAlign: 'right' }}>
      <DualLanguageText>
        <h3>{hmpbStrings.hmpbVotingComplete}</h3>
      </DualLanguageText>
    </div>
  );

  let endOfPageInstruction;
  if (totalPages !== undefined) {
    endOfPageInstruction =
      pageNumber === totalPages ? ballotComplete : continueVoting;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <QrCodeSlot />
        <Box
          fill="tinted"
          style={{
            padding: '0.25rem 0.5rem',
            flex: 1,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            {totalPages !== undefined && (
              <div>
                <div style={{ fontSize: '0.85rem' }}>
                  <DualLanguageText delimiter="/">
                    {hmpbStrings.hmpbPage}
                  </DualLanguageText>
                </div>
                <h1>
                  {pageNumber}/{totalPages}
                </h1>
              </div>
            )}
          </div>
          {pageNumber % 2 === 1 && (
            <div
              className={FOOTER_SLOT_CLASS}
              style={{ display: 'flex', fontSize: '8pt', gap: '0.5rem' }}
            ></div>
          )}
          <div>{endOfPageInstruction}</div>

          {/* <BallotHashSlot> must appear in the document, but we don't want it displayed */}
          <div style={{ display: 'none' }}>
            <BallotHashSlot />
          </div>
        </Box>
      </div>
    </div>
  );
}
