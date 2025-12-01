import styled from 'styled-components';

import { PageNavigationButtonId } from './accessible_controllers';
import { Button } from './button';
import { Screen } from './screen';
import { H1, H2, H3, P } from './typography';
import { appStrings, ReadOnLoad } from './ui_strings';
import { WithScrollButtons } from './with_scroll_buttons';

const StyledScreen = styled(Screen)`
  height: 100vh;
`;

const Header = styled(H1)`
  font-size: 1.5em;
  padding: 0.5rem;
`;

const Content = styled.div`
  /**
   * The intrinsic height of this element when the content is long exceeds the viewport,
   * preventing WithScrollButtons from working as intended. height: 0 removes the intrinsic height
   * so that flex-grow: 1 can drive the height based on the available space.
   */
  height: 0;
  flex-grow: 1;
`;

const Footer = styled.div`
  display: flex;
  justify-content: end;
  padding: 0.5rem;
`;

//
// Export pre-styled text components for use by consumers
//

export const VoterHelpScreenH2 = styled(H2)`
  font-size: 1em;
`;

export const VoterHelpScreenH3 = styled(H3)`
  font-size: 0.75em;
`;

export const VoterHelpScreenP = styled(P)`
  font-size: 0.75em;
`;

export function VoterHelpScreen({
  children,
  scrollButtonsFocusable,
  onClose,
}: {
  children?: React.ReactNode;
  scrollButtonsFocusable?: boolean;
  onClose: () => void;
}): JSX.Element {
  return (
    <StyledScreen>
      <Header>{appStrings.voterHelpScreenHeading()}</Header>
      <Content>
        <WithScrollButtons focusable={scrollButtonsFocusable}>
          <ReadOnLoad>{children}</ReadOnLoad>
        </WithScrollButtons>
      </Content>
      <Footer>
        <Button id={PageNavigationButtonId.NEXT} onPress={onClose}>
          {appStrings.buttonClose()}
        </Button>
      </Footer>
    </StyledScreen>
  );
}
