import { Meta } from '@storybook/react';
import styled from 'styled-components';

import { ICON_COLORS, IconComponent, IconProps, Icons } from './icons';
import { H1, H5, P } from './typography';

const meta: Meta<IconComponent> = {
  title: 'libs-ui/Icons',
  args: {
    color: 'default',
  },
  argTypes: {
    color: {
      type: 'select',
      options: [undefined, ...ICON_COLORS],
    },
  },
};
export default meta;

const StyledCodeBlock = styled.code`
  font-size: 0.75rem;
  white-space: pre;
`;

const sampleCode = `import {Icons} from "@votingworks/ui";

<Icons.Warning color="warning" /> You have been warned.
`;

export function icons(props: IconProps): JSX.Element {
  return (
    <div>
      <H1>Icons</H1>
      <H5 as="h2">Usage:</H5>
      <StyledCodeBlock>{sampleCode}</StyledCodeBlock>
      <br />
      <P>
        <Icons.Warning color="warning" /> You have been warned.
      </P>
      <H5 as="h2">Icon List:</H5>
      {Object.entries(Icons)
        .filter(([, Icon]) => typeof Icon === 'function')
        .map(([name, Icon]) => (
          <P key={name}>
            <Icon {...props} /> &mdash; {name}
          </P>
        ))}
    </div>
  );
}
