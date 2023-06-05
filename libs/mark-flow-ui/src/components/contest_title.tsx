import React from 'react';

import { Caption, H2 } from '@votingworks/ui';
import styled from 'styled-components';

export interface ContestTitleProps {
  districtName: string;
  title: string;
}

const DistrictName = styled(Caption)`
  display: block;
  margin-bottom: 0;
`;

export function ContestTitle(props: ContestTitleProps): JSX.Element {
  const { districtName, title } = props;

  return (
    <H2 as="h1" aria-label={`${districtName} ${title}.`}>
      <DistrictName weight="semiBold">{districtName}</DistrictName>
      {title}
    </H2>
  );
}
