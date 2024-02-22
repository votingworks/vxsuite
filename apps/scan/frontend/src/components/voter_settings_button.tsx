import { Button, Icons, appStrings } from '@votingworks/ui';
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

export function VoterSettingsButton(): JSX.Element | null {
  const history = useHistory();

  if (!history) {
    // We're likely running within a test with no react-router context.
    return null;
  }

  return (
    <Button
      onPress={(url: string) => history.push(url)}
      value={Paths.VOTER_SETTINGS}
    >
      <LabelContainer>
        <Icons.Display />
        {appStrings.buttonVoterSettings()}
      </LabelContainer>
    </Button>
  );
}
