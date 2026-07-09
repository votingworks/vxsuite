import React from 'react';
import styled, { css } from 'styled-components';
import { DateTime } from 'luxon';

import { Font, Icons } from '@votingworks/ui';
import { PollingPlaceType, pollingPlaceTypeName } from '@votingworks/types';

import { TIME_FORMAT } from '../../config/globals';
import { LocationCvrCard } from './location_cvr_card';

export type LocationImportCardProps = Props;
interface Props {
  disabled: boolean;
  exportTimestamp: Date;
  name: string;
  path: string;
  nCvrs: number;
  onPress: (path: string) => void;
  scannerIds: readonly string[];
  status: Status;
  testExport: boolean;
  type: PollingPlaceType;
}

export type Status = 'imported' | 'importing' | 'ready';

const ColorText = styled.span<{ color: 'primary' | 'warningAccent' }>`
  color: ${(p) => p.theme.colors[p.color]};
  font-weight: ${(p) => p.theme.sizes.fontWeight.bold};
`;

const HEADER_MUTED_CSS = css`
  color: ${(p) => p.theme.colors.onBackgroundMuted};

  ${ColorText} {
    color: ${(p) => p.theme.colors.onBackgroundMuted};
  }
`;

const Header = styled(Font)<{ muted: boolean }>`
  color: ${(p) => p.theme.colors.onBackground};
  ${(p) => p.muted && HEADER_MUTED_CSS}
`;

const Label = styled.div`
  text-align: center;

  /* Keep width consistent across states, to avoid container width changes. */
  width: 7ch;
`;

const ICONS: Record<Status, JSX.Element> = {
  importing: <Icons.Loading />,
  imported: <Icons.Done />,
  ready: <Icons.Import color="primary" />,
};

const ICON_LABELS: Record<Status, string> = {
  imported: 'Loaded',
  importing: 'Loading',
  ready: 'Load',
};

export function LocationImportCard(props: Props): React.ReactNode {
  const {
    disabled,
    exportTimestamp,
    name,
    nCvrs,
    onPress,
    path,
    scannerIds,
    status,
    testExport,
    type,
  } = props;

  const muted = disabled || status !== 'ready';
  const separator = <span> &bull; </span>;

  return (
    <LocationCvrCard
      disabled={muted}
      id={path}
      onClick={onPress}
      icon={ICONS[status]}
      iconLabel={<Label>{ICON_LABELS[status]}</Label>}
      header={
        <Header muted={muted}>
          <ColorText color={testExport ? 'warningAccent' : 'primary'}>
            {testExport ? 'TEST' : 'OFFICIAL'}
          </ColorText>
          {separator}
          {DateTime.fromJSDate(exportTimestamp).toFormat(TIME_FORMAT)}
        </Header>
      }
      name={name}
      caption={
        <React.Fragment>
          {pollingPlaceTypeName(type)}
          {separator}
          {scannerIds.length === 1
            ? `Scanner ${scannerIds[0]}`
            : `Scanners: ${scannerIds.join(', ')}`}
        </React.Fragment>
      }
      count={nCvrs}
    />
  );
}
