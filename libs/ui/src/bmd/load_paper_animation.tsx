/* istanbul ignore file */
import { rgba } from 'polished';
import styled, { css, keyframes } from 'styled-components';
import { Svg } from '../svg';

const DURATION_SECONDS = 5;
const BORDER_RADIUS_FRAME_CSS_VAL = '1vh';
const CONTAINER_SIZE_CSS_VAL = '45vh';
const DIMPLE_SIZE_CSS_VAL = '3vh';
const SHEET_WIDTH_CSS_VAL = '40%';
const SHEET_TOP_OFFSET_CSS_VAL = `calc(0.1 * ${CONTAINER_SIZE_CSS_VAL})`;

const Container = styled.div`
  height: ${CONTAINER_SIZE_CSS_VAL};
  margin: auto;
  overflow: hidden;
  position: relative;
  width: ${CONTAINER_SIZE_CSS_VAL};

  &:not(:last-child) {
    margin-bottom: 1rem;
  }
`;

const keyframesSheet = keyframes`
  0% { transform: translate(-50%, 0); }
  30% { transform: translate(-50%, 0); }
  50% { transform: translate(-50%, 50%); }
  90% { transform: translate(-50%, 0); }
  100% { transform: translate(-50%, 0); }
`;

const keyframesArrow = keyframes`
  0% { opacity: 1; }
  20% { opacity: 1; }
  43% { opacity: 0; }
  90% { opacity: 0; }
  100% { opacity: 1; }
`;

const keyframesHood = keyframes`
  0% { opacity: 0; }
  40% { opacity: 0; }
  50% { opacity: 1; }
  90% { opacity: 1; }
  100% { opacity: 0; }
`;

const svgDropShadow = css`
  filter: drop-shadow(
    0.25rem 0.25rem 0.25rem ${(p) => rgba(p.theme.colors.onBackground, 0.25)}
  );
`;

const htmlInsetShadow = css`
  box-shadow: inset 0.1rem -0.2rem 0.2rem 0.1rem ${(p) => rgba(p.theme.colors.onBackground, 0.25)};
`;

const borderMachineFrame = css`
  border: ${(p) =>
    `${p.theme.sizes.bordersRem.thin}rem solid ${p.theme.colors.onBackground}`};
`;

const Base = styled.div`
  background-color: ${(p) => rgba(p.theme.colors.onBackground, 0.75)};
  border-radius: ${BORDER_RADIUS_FRAME_CSS_VAL};
  display: flex;
  height: 100%;
  justify-content: center;
  left: 50%;
  position: absolute;
  top: 0;
  transform: translate(-50%);
  width: 60%;

  ${borderMachineFrame}
`;

const BaseInset = styled.div`
  border-bottom-left-radius: ${BORDER_RADIUS_FRAME_CSS_VAL};
  border-bottom-right-radius: ${BORDER_RADIUS_FRAME_CSS_VAL};
  height: 92.5%;
  position: relative;
  width: 70%;

  ${htmlInsetShadow}
`;

const BaseDimple = styled.div`
  border-radius: 100vw;
  bottom: 1.5vh;
  height: ${DIMPLE_SIZE_CSS_VAL};
  left: 50%;
  position: absolute;
  transform: translate(-50%);
  width: ${DIMPLE_SIZE_CSS_VAL};

  ${htmlInsetShadow}
`;

const Hood = styled.div`
  animation: ${keyframesHood} ${DURATION_SECONDS}s ease-in-out infinite;
  background-color: ${(p) => rgba(p.theme.colors.onBackground, 0.75)};
  border-radius: ${BORDER_RADIUS_FRAME_CSS_VAL} ${BORDER_RADIUS_FRAME_CSS_VAL}
    calc(${BORDER_RADIUS_FRAME_CSS_VAL} * 2)
    calc(${BORDER_RADIUS_FRAME_CSS_VAL} * 2);
  height: 40%;
  left: 50%;
  position: absolute;
  top: 0;
  transform: translate(-50%);
  width: 60%;

  ${borderMachineFrame}
`;

const Sheet = styled.svg`
  animation: ${keyframesSheet} ${DURATION_SECONDS}s ease-in-out infinite;
  left: 50%;
  overflow: visible;
  position: absolute;
  top: ${SHEET_TOP_OFFSET_CSS_VAL};
  transform: translate(-50%, 0%);
  width: ${SHEET_WIDTH_CSS_VAL};

  path {
    fill: ${(p) => p.theme.colors.background};

    ${svgDropShadow}
  }
`;

const Arrow = styled.svg`
  animation: ${keyframesArrow} ${DURATION_SECONDS}s ease-in-out infinite;

  /* Additional nudge to get the arrow pointing at the corner of the sheet: */
  left: calc(50% + (${SHEET_WIDTH_CSS_VAL} / 2) + 3%);
  overflow: visible;
  position: absolute;
  stroke: ${(p) => p.theme.colors.background};
  stroke-width: 1.5;
  top: ${SHEET_TOP_OFFSET_CSS_VAL};
  transform: translate(-50%, -80%);
  width: 10%;

  path {
    ${svgDropShadow}
  }
`;

export function LoadPaperAnimation(): JSX.Element {
  return (
    <Container>
      <Base>
        <BaseInset>
          <BaseDimple />
        </BaseInset>
      </Base>
      <Sheet viewBox="0 0 310 537" xmlns="http://www.w3.org/2000/svg">
        <path d="M0.5 536.5V0.5H259L310 51.5V536.5H0.5Z" />
      </Sheet>
      <Arrow viewBox="0 0 58 58" xmlns="http://www.w3.org/2000/svg">
        <Svg.PrimaryFillPath d="M1.98814 19.5778C2.57708 19.3338 3.22515 19.2701 3.85035 19.3945C4.47555 19.519 5.04979 19.8261 5.5004 20.277L12.889 27.6656L39.6112 0.943434C40.2155 0.339353 41.035 0 41.8894 0C42.7438 0 43.5633 0.339353 44.1675 0.943434L57.0566 13.8325C57.6606 14.4367 58 15.2562 58 16.1106C58 16.965 57.6606 17.7845 57.0566 18.3888L30.3344 45.111L37.723 52.4996C38.1735 52.9502 38.4803 53.5243 38.6046 54.1493C38.7288 54.7743 38.665 55.422 38.4212 56.0107C38.1774 56.5995 37.7645 57.1027 37.2347 57.4567C36.7049 57.8108 36.0821 57.9999 35.4449 58H3.22226C2.36766 58 1.54807 57.6605 0.943775 57.0562C0.339485 56.4519 0 55.6323 0 54.7777V22.5551C-0.000160217 21.9179 0.188637 21.2949 0.542519 20.7649C0.8964 20.235 1.39948 19.8218 1.98814 19.5778Z" />
      </Arrow>
      <Hood />
    </Container>
  );
}
