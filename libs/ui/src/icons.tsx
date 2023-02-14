/* stylelint-disable order/properties-order */
import React from 'react';
import styled from 'styled-components';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleLeft,
  faCircleRight,
  faPencil,
  faCheckCircle,
  faGear,
  faExclamationCircle,
  faExclamationTriangle,
  faInfoCircle,
  faTrashCan,
} from '@fortawesome/free-solid-svg-icons';

interface InnerProps {
  type: IconDefinition;
}

const StyledSvgIcon = styled.svg`
  fill: currentColor;
  height: 1em;
  width: 1em;
`;

function FaIcon(props: InnerProps): JSX.Element {
  const { type } = props;

  return <FontAwesomeIcon icon={type} />;
}

/**
 * Provides commonly used icons for communicating meaning/context to the user.
 * The VVSG spec recommends using iconography instead of/in addition to any
 * colors.
 */
export const Icons = {
  Checkmark(): JSX.Element {
    return (
      <StyledSvgIcon
        aria-hidden="true"
        role="img"
        width="100"
        height="100"
        viewBox="0 0 100 100"
      >
        <path d="M89.7038 10.1045C88.2094 8.40006 85.759 8.40006 84.2646 10.1045L39.0198 61.5065L15.719 34.8471C14.2245 33.1364 11.7906 33.1364 10.2852 34.8471L2.12082 44.1186C0.626395 45.8105 0.626395 48.5951 2.12082 50.2996L36.2782 89.3708C37.7727 91.0628 40.2066 91.0628 41.7175 89.3708L97.8627 25.5632C99.3791 23.8587 99.3791 21.0679 97.8627 19.3572L89.7038 10.1045Z" />
      </StyledSvgIcon>
    );
  },

  Danger(): JSX.Element {
    return <FaIcon type={faExclamationCircle} />;
  },

  Delete(): JSX.Element {
    return <FaIcon type={faTrashCan} />;
  },

  Done(): JSX.Element {
    return <FaIcon type={faCheckCircle} />;
  },

  Edit(): JSX.Element {
    return <FaIcon type={faPencil} />;
  },

  Info(): JSX.Element {
    return <FaIcon type={faInfoCircle} />;
  },

  Next(): JSX.Element {
    return <FaIcon type={faCircleRight} />;
  },

  Previous(): JSX.Element {
    return <FaIcon type={faCircleLeft} />;
  },

  Settings(): JSX.Element {
    return <FaIcon type={faGear} />;
  },

  Warning(): JSX.Element {
    return <FaIcon type={faExclamationTriangle} />;
  },
} as const;
