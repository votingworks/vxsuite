import React, { useCallback, useState, useEffect } from 'react';
import { H1, Icons, P, ReadOnLoad, appStrings } from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/basics';
import { behaviorToKeypressMap, validKeypressValues } from './constants';
import { PortraitStepInnerContainer } from './portrait_step_inner_container';

export type InputBehavior = 'Move' | 'Select';

const identifyInputAppStrings: Readonly<
  Record<InputBehavior, () => JSX.Element>
> = {
  Move: appStrings.titleBmdPatCalibrationIdentifyMoveInput,
  Select: appStrings.titleBmdPatCalibrationIdentifySelectInput,
};

const inputNameAppStrings: Readonly<Record<InputBehavior, () => JSX.Element>> =
  {
    Move: appStrings.bmdPatDeviceInputNameMove,
    Select: appStrings.bmdPatDeviceInputNameSelect,
  };

// Each input identification step is broken into these sub-steps, named Phases for disambiguation
type InputIdentificationPhase =
  | 'unidentified'
  | 'identified'
  // The "wrong" input has been triggered. Devices vary so it's not possible to give detailed
  // information on which input maps to which behavior. Messaging for this state
  // should be friendly and forgiving because instructions to the voter will be limited.
  | 'other_input';

function getOtherInputName(inputName: InputBehavior) {
  return inputName === 'Move' ? 'Select' : 'Move';
}

export function IdentifyInputStep({
  inputName,
  onStepCompleted,
}: {
  inputName: InputBehavior;
  onStepCompleted: () => void;
}): JSX.Element {
  const [inputIdentificationPhase, setInputIdentificationPhase] =
    useState<InputIdentificationPhase>('unidentified');

  // Reset phase when target input method changes:
  React.useEffect(() => {
    setInputIdentificationPhase('unidentified');
  }, [inputName]);

  const handleInput = useCallback(
    (event: KeyboardEvent) => {
      if (!validKeypressValues.includes(event.key)) {
        return;
      }

      event.preventDefault();

      if (event.key === behaviorToKeypressMap[inputName]) {
        switch (inputIdentificationPhase) {
          case 'unidentified':
            setInputIdentificationPhase('identified');
            break;
          case 'identified':
            onStepCompleted();
            break;
          case 'other_input':
            setInputIdentificationPhase('identified');
            break;
          /* istanbul ignore next - compile time check for completeness */
          default:
            throwIllegalValue(inputIdentificationPhase);
        }
      } else if (
        event.key === behaviorToKeypressMap[getOtherInputName(inputName)]
      ) {
        setInputIdentificationPhase('other_input');
      }
    },
    [
      inputName,
      inputIdentificationPhase,
      setInputIdentificationPhase,
      onStepCompleted,
    ]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleInput);

    return () => {
      document.removeEventListener('keydown', handleInput);
    };
  }, [handleInput]);

  let headerContent: React.ReactNode = null;
  let bodyContent: React.ReactNode = null;
  let icon: React.ReactNode = null;

  switch (inputIdentificationPhase) {
    case 'unidentified':
      headerContent = identifyInputAppStrings[inputName]();
      bodyContent = appStrings.instructionsBmdPatCalibrationActivateInput();
      icon = <Icons.Question />;
      break;
    case 'identified':
      headerContent = (
        <React.Fragment>
          {appStrings.labelBmdPatCalibrationInputIdentified()}{' '}
          {inputNameAppStrings[inputName]()}
        </React.Fragment>
      );
      bodyContent =
        appStrings.instructionsBmdPatCalibrationActivateInputAgain();
      icon = <Icons.Done color="success" />;
      break;
    case 'other_input':
      headerContent = (
        <React.Fragment>
          {appStrings.labelBmdPatCalibrationInputActivated()}{' '}
          {inputNameAppStrings[getOtherInputName(inputName)]()}
        </React.Fragment>
      );
      bodyContent =
        appStrings.instructionsBmdPatCalibrationActivateOtherInput();
      icon = <Icons.Danger color="warning" />;
      break;
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(inputIdentificationPhase);
  }

  return (
    <PortraitStepInnerContainer>
      {/*
       * Include `key` to trigger a remount (to re-trigger screen reader audio)
       * when the current phase content changes.
       */}
      <ReadOnLoad key={inputIdentificationPhase}>
        {icon}
        <H1>{headerContent}</H1>
        <P>{bodyContent}</P>
      </ReadOnLoad>
    </PortraitStepInnerContainer>
  );
}
