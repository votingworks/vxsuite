import React from 'react';
import styled from 'styled-components';
import { Button, H3, Modal, Table, TD } from '@votingworks/ui';

const KeyCode = styled.kbd`
  display: inline-block;
  padding: 0.125rem 0.375rem;
  font-family: monospace;
  font-size: 0.875rem;
  background: ${(p) => p.theme.colors.containerLow};
  border: 1px solid ${(p) => p.theme.colors.outline};
  border-radius: 0.25rem;
`;

interface HelpOverlayProps {
  readonly onClose: () => void;
}

function ShortcutRow({
  keys,
  description,
}: {
  readonly keys: string;
  readonly description: string;
}): JSX.Element {
  return (
    <tr>
      <TD narrow nowrap>
        <KeyCode>{keys}</KeyCode>
      </TD>
      <TD>{description}</TD>
    </tr>
  );
}

export function HelpOverlay({ onClose }: HelpOverlayProps): JSX.Element {
  return (
    <Modal
      title="Keyboard Shortcuts"
      content={
        <React.Fragment>
          <H3>Navigation</H3>
          <Table condensed>
            <tbody>
              <ShortcutRow keys="j / ↓" description="Move down in list" />
              <ShortcutRow keys="k / ↑" description="Move up in list" />
              <ShortcutRow keys="g / G" description="Jump to top / bottom" />
              <ShortcutRow keys="Enter" description="Load selected ballot" />
            </tbody>
          </Table>

          <H3>Preview</H3>
          <Table condensed>
            <tbody>
              <ShortcutRow keys="f" description="View front image" />
              <ShortcutRow keys="b" description="View back image" />
              <ShortcutRow keys="v" description="Toggle interpretation view" />
              <ShortcutRow keys="i" description="Toggle score overlay" />
              <ShortcutRow keys="c" description="Copy ballot ID" />
            </tbody>
          </Table>

          <H3>Filtering</H3>
          <Table condensed>
            <tbody>
              <ShortcutRow keys="/" description="Open filter popup" />
              <ShortcutRow keys="r" description="Toggle rejected ballots" />
            </tbody>
          </Table>

          <H3>Other</H3>
          <Table condensed>
            <tbody>
              <ShortcutRow keys="?" description="Show this help" />
              <ShortcutRow keys="q" description="Back to file picker" />
            </tbody>
          </Table>
        </React.Fragment>
      }
      actions={
        <Button onPress={onClose}>Close</Button>
      }
      onOverlayClick={onClose}
    />
  );
}
