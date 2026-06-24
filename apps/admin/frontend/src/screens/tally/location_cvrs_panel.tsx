import styled, { css } from 'styled-components';

import {
  Button,
  Callout,
  Caption,
  DesktopPalette,
  Font,
  Icons,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { PollingPlaceType, pollingPlaceTypeName } from '@votingworks/types';
import type { CastVoteRecordFileRecord } from '@votingworks/admin-backend';
import { GAP, INSET_FOCUS_OUTLINE } from './styles';

export interface LocationCvrsPanelProps {
  closePanel: () => void;
  open: boolean;
  imports: LocationCvrImport[];
  name: string;
  type: PollingPlaceType;
}

export type LocationCvrImport = Pick<
  CastVoteRecordFileRecord,
  'id' | 'exportTimestamp' | 'numCvrsImported' | 'scannerIds'
>;

const CalloutContent = styled(Caption)`
  align-items: start;
  display: grid;
  gap: ${GAP};
  grid-template-rows: min-content 1fr;
`;

const Container = styled.div`
  height: 100%;
  min-width: 0;
  overflow: hidden;
`;

/*
 * istanbul ignore next - @starting-style rule is incompatible with our
 * current jsdom version.
 */
const CONTENT_STARTING_STYLE =
  process.env.NODE_ENV !== 'test' &&
  css`
    /* stylelint-disable-next-line at-rule-no-unknown */
    @starting-style {
      opacity: 0;
    }
  `;

const Content = styled.div`
  display: grid;
  gap: ${GAP};
  grid-template-rows: min-content 1fr;
  min-width: min-content;
  opacity: 1;
  transition: opacity 250ms ease-in;

  ${CONTENT_STARTING_STYLE}
`;

const DetailsBody = styled.ul`
  align-items: center;
  display: grid;
  gap: ${GAP};
  margin: 0;
  padding: 0;
`;

const BOTTOM_BORDER_SEPARATOR = css`
  border-bottom: 1px dashed ${DesktopPalette.Gray40};
`;

const Header = styled.div`
  ${BOTTOM_BORDER_SEPARATOR}

  align-items: start;
  display: flex;
  justify-content: space-between;
  padding-bottom: ${GAP};
`;

const IconButton = styled.div`
  border-color: transparent;
  font-size: 0.75rem;
  gap: 0.25rem;
  padding: 0.35rem 0.5rem; /* Squares out the button's dimensions. */

  :focus:focus-visible {
    ${INSET_FOCUS_OUTLINE}
  }
`;

const Import = styled.li`
  ${BOTTOM_BORDER_SEPARATOR}

  align-items: center;
  display: grid;
  gap: ${GAP};
  grid-template-columns: 1fr min-content min-content;
  padding-bottom: ${GAP};
`;

const Title = styled.div`
  display: grid;
`;

export function LocationCvrsPanel(props: LocationCvrsPanelProps): JSX.Element {
  const { closePanel, imports, name, open, type } = props;

  if (!open) return <Container />;

  function scannerDetails(i: LocationCvrImport) {
    return i.scannerIds.length === 1
      ? `Scanner ${i.scannerIds[0]}`
      : `Scanners: ${i.scannerIds.join(', ')}`;
  }

  return (
    <Container>
      <Content>
        <Header>
          <Title>
            <Caption>{pollingPlaceTypeName(type)}</Caption>
            <Font weight="bold">{name}</Font>
          </Title>
          <IconButton
            aria-label="Close Panel"
            as={Button}
            icon="X"
            onPress={closePanel}
            color="primary"
          />
        </Header>

        <DetailsBody>
          {imports.map((i) => (
            <Import key={i.id}>
              <Caption weight="semiBold">
                {format.localeShortDateAndTime(new Date(i.exportTimestamp))}
                <br />
                <Caption weight="regular">{scannerDetails(i)}</Caption>
              </Caption>

              <Font weight="bold">{format.count(i.numCvrsImported)}</Font>

              {/*
               * [TODO](https://github.com/votingworks/vxsuite/issues/4048)
               * Add single-import delete button.
               */}
            </Import>
          ))}

          {imports.length === 0 && (
            <Callout>
              <CalloutContent>
                <Font weight="bold">
                  <Icons.Info /> No CVRs
                </Font>
                <span>
                  No files have been loaded from this location yet. When you are
                  ready, insert the USB drive containing an export from the
                  location and click &quot;Load&quot; to import it.
                </span>
              </CalloutContent>
            </Callout>
          )}
        </DetailsBody>
      </Content>
    </Container>
  );
}
