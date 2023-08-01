import styled from 'styled-components';

import { Main } from '@votingworks/ui';

export const MainContent = styled(Main)`
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.foreground};
  border-bottom: 0;
  border-right: 0;
  border-top-left-radius: 0.25rem;
`;
