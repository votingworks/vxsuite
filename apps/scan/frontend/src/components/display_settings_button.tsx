import { Button, Icons } from '@votingworks/ui';
import styled from 'styled-components';
import { useHistory } from 'react-router-dom';
import { Paths } from '../constants';

const LabelContainer = styled.span`
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  gap: 0.5rem;
  text-align: left;
`;

export function DisplaySettingsButton(): JSX.Element | null {
  const history = useHistory();

  if (!history) {
    // We're likely running within a test with no react-router context.
    return null;
  }

  return (
    <Button onPress={history.push} value={Paths.DISPLAY_SETTINGS}>
      <LabelContainer>
        <Icons.Display />
        <span>Color & Size</span>
      </LabelContainer>
    </Button>
  );
}
