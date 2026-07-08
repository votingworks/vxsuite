/* istanbul ignore file - TODO: remove when CvrUsbExports is implemented. */
import React from 'react';
import styled from 'styled-components';

import { Button, Card, Font, H3, H4, Icons, Modal, P } from '@votingworks/ui';

import { format } from '@votingworks/utils';
import type {
  CvrFileImportInfo,
  CvrFileMode,
} from '@votingworks/admin-backend';
import { throwIllegalValue } from '@votingworks/basics';
import { CvrImporter, useCvrImporter } from './cvr_importer';
import { CvrUsbExports } from './cvr_usb_exports';
import { BORDER_LIGHT, GAP } from './styles';

export interface Props {
  className?: string;
  onClose: () => void;
}

export function CvrImportPanel(props: Props): React.ReactNode {
  const importer = useCvrImporter();

  if (importer.state === 'loading') {
    return (
      <Panel {...props} importer={importer} mode={null}>
        <Loading />
      </Panel>
    );
  }

  const { mode } = importer.existingImports;

  if (importer.state === 'noUsb') {
    return (
      <Panel {...props} importer={importer} mode={mode}>
        <NoUsb />
      </Panel>
    );
  }

  const alert: React.ReactNode = (() => {
    switch (importer.state) {
      case 'error':
        return (
          <Alert close={importer.reset} title="Error">
            There was an error reading the contents of{' '}
            <Font weight="bold">{importer.filename}</Font>:{' '}
            {importer.errorMessage}
          </Alert>
        );

      case 'duplicate':
        return (
          <Alert close={importer.reset} title="Duplicate Export">
            The selected export was ignored as a duplicate of a previously
            loaded export.
          </Alert>
        );

      case 'success':
        if (importer.result.alreadyPresent === 0) return null;
        return (
          <PartialImportAlert close={importer.reset} result={importer.result} />
        );

      case 'importing':
      case 'init':
        return null;

      /* istanbul ignore next */
      default:
        throwIllegalValue(importer, 'state');
    }
  })();

  return (
    <Panel {...props} importer={importer} mode={mode}>
      <CvrUsbExports key="exports" importer={importer} />
      {alert}
    </Panel>
  );
}

const Body = styled.div`
  display: grid;
  gap: ${GAP};
  grid-template-rows: min-content 1fr;
  overflow-y: hidden;
`;

const Container = styled.div`
  display: grid;
  grid-template-rows: 1fr min-content;
  gap: ${GAP};
  height: 100%;
  overflow-y: hidden;
`;

const TITLES: Record<CvrFileMode, string> = {
  official: 'Load Official Ballot CVRs',
  test: 'Load Test Ballot CVRs',
  unlocked: 'Load CVRs',
};

function Panel(props: {
  children?: React.ReactNode;
  className?: string;
  importer: CvrImporter;
  mode: CvrFileMode | null;
  onClose: () => void;
}) {
  const { children, className, importer, mode, onClose } = props;
  const disableClose = importer.state === 'importing';

  return (
    <Container className={className}>
      <Body>
        {mode && <H3 style={{ fontWeight: 700, margin: 0 }}>{TITLES[mode]}</H3>}
        {children}
      </Body>

      <div style={{ display: 'flex', justifyContent: 'end' }}>
        <Button
          disabled={disableClose}
          fill="outlined"
          icon="Done"
          onPress={onClose}
          variant={disableClose ? 'neutral' : 'primary'}
        >
          Done
        </Button>
      </div>
    </Container>
  );
}

function Alert(props: {
  children: React.ReactNode;
  close: () => void;
  title: React.ReactNode;
}) {
  const { children, close, title } = props;

  return (
    <Modal
      title={title}
      content={<P>{children}</P>}
      onOverlayClick={close}
      actions={
        <Button icon="Done" onPress={close}>
          Close
        </Button>
      }
    />
  );
}

const LoadingContainer = styled(Card)`
  ${BORDER_LIGHT}
  padding: 5rem;

  > * {
    align-items: center;
    color: ${(p) => p.theme.colors.neutral};
    display: grid;
    justify-content: center;

    > h3 {
      align-items: center;
      display: flex;
      gap: ${GAP};
      font-size: 1.5rem;
    }
  }
`;

function Loading() {
  return (
    <LoadingContainer>
      <H3>
        <Icons.Loading />
        <Font weight="semiBold">Loading</Font>
      </H3>
    </LoadingContainer>
  );
}

function NoUsb(): React.ReactNode {
  return (
    <div>
      <Card color="warning" style={{ maxWidth: 'max-content' }}>
        <H4>
          <Icons.Warning color="warning" style={{ marginRight: GAP }} />
          No USB Drive Detected
        </H4>
        <Font>Insert a USB drive in order to load CVRs from a scanner.</Font>
      </Card>
    </div>
  );
}

function PartialImportAlert(props: {
  close: () => void;
  result: CvrFileImportInfo;
}) {
  const { close, result } = props;
  const { alreadyPresent, newlyAdded } = result;
  const total = alreadyPresent + newlyAdded;

  if (total === 1) {
    return (
      <Alert close={close} title="1 New CVR Loaded">
        The 1 CVR in the selected export was previously loaded.
      </Alert>
    );
  }

  return (
    <Alert close={close} title={`${format.count(newlyAdded)} New CVRs Loaded`}>
      {format.count(alreadyPresent)} of the {format.count(total)} total CVRs in
      the selected export {alreadyPresent === 1 ? 'was' : 'were'} previously
      loaded.
    </Alert>
  );
}
