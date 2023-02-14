/* stylelint-disable order/properties-order */
import React from 'react';
import { Meta } from '@storybook/react';
import styled from 'styled-components';

import { Icons } from './icons';
import { H1, H5, P } from './typography';

const meta: Meta = {
  title: 'libs-ui/Icons',
};
export default meta;

const StyledCodeBlock = styled.code`
  font-size: 0.75rem;
  white-space: pre;
`;

const sampleCode = `import {Icons} from "@votingworks/ui";

<P color="warning">
  <Icons.Warning /> You have been warned.
</P>
`;

function renderIcon([name, Component]: [string, () => JSX.Element]) {
  if (typeof Component !== 'function') {
    return null;
  }

  return (
    <P key={name}>
      <Component /> &mdash; {name}
    </P>
  );
}

export function icons(): JSX.Element {
  return (
    <div>
      <H1>Icons</H1>
      <H5 as="h2">Usage:</H5>
      <StyledCodeBlock>{sampleCode}</StyledCodeBlock>
      <br />
      <P color="warning">
        <Icons.Warning /> You have been warned.
      </P>
      <H5 as="h2">Icon List:</H5>
      {Object.entries(Icons).map(renderIcon)}
    </div>
  );
}
