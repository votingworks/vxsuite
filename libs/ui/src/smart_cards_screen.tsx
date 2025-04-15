import styled from 'styled-components';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { format, hyphenatePin } from '@votingworks/utils';
import { Election, UserWithCard } from '@votingworks/types';
import React from 'react';
import { Callout } from './callout';
import { H2, H3, P } from './typography';
import { Button } from './button';
import { Modal } from './modal';
import { Icons } from './icons';
import { CardIllustration } from './card_illustration';
import { InsertCardImage, RotateCardImage } from './smart_card_images';

export const SmartCardsScreenButtonList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: start;
`;

function toLowerCaseExceptFirst(str: string): string {
  // istanbul ignore next
  if (str.length === 0) {
    return str;
  }

  const firstLetter = str[0];
  const restOfString = str.slice(1).toLowerCase();

  return firstLetter + restOfString;
}

type CardRole = UserWithCard['role'];

const prettyRoles: Record<CardRole, string> = {
  vendor: 'Vendor',
  system_administrator: 'System Administrator',
  election_manager: 'Election Manager',
  poll_worker: 'Poll Worker',
};

const ImageWrapper = styled.div`
  height: 12rem;
  display: flex;
`;

const CardActions = styled.div`
  padding: 1rem;
  display: flex;
  flex-direction: column;
`;

export function InsertCardPrompt({
  cardStatus,
}: {
  cardStatus: 'no_card' | 'card_error';
}): JSX.Element {
  return (
    <React.Fragment>
      <CardIllustration inserted={false}>
        {cardStatus === 'no_card' ? (
          <React.Fragment>
            <ImageWrapper>
              <InsertCardImage cardInsertionDirection="right" />
            </ImageWrapper>
            <H2>Insert a smart card</H2>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <ImageWrapper>
              <RotateCardImage cardInsertionDirection="right" />
            </ImageWrapper>
            <H2>Card Backward</H2>
          </React.Fragment>
        )}
      </CardIllustration>
      <CardActions>
        <Callout color="primary" icon="Info">
          Insert a smart card to program or modify it.
        </Callout>
        <SmartCardsScreenButtonList
          style={{ alignItems: 'start', marginTop: '1rem' }}
        >
          <Button onPress={() => {}} disabled>
            Program Election Manager Card
          </Button>
          <Button onPress={() => {}} disabled>
            Program Poll Worker Card
          </Button>
          <Button onPress={() => {}} disabled>
            Program System Administrator Card
          </Button>
        </SmartCardsScreenButtonList>
      </CardActions>
    </React.Fragment>
  );
}

type SmartCardAction = 'Program' | 'PinReset' | 'Unprogram';

export interface SmartCardActionResult {
  status: 'Success' | 'Error';
  action: SmartCardAction;
  role: CardRole;
  newPin?: string;
}

const CardPin = styled.div`
  font-size: 2.5rem;
  font-weight: bold;
  color: ${(p) => p.theme.colors.primary};
`;

export function ActionResultCallout({
  result,
}: {
  result: SmartCardActionResult;
}): JSX.Element {
  const { action, newPin, status } = result;
  const cardRole = prettyRoles[result.role];

  if (status === 'Error') {
    let text: string;
    switch (action) {
      case 'Program': {
        text = `Error programming ${cardRole.toLowerCase()} card.`;
        break;
      }
      case 'PinReset': {
        text = `Error resetting ${cardRole.toLowerCase()} card PIN.`;
        break;
      }
      case 'Unprogram': {
        text = `Error unprogramming ${cardRole.toLowerCase()} card.`;
        break;
      }
      default: {
        /* istanbul ignore next - @preserve */
        throwIllegalValue(action);
      }
    }
    return (
      <Callout color="danger" icon="Danger">
        {text} Please try again.
      </Callout>
    );
  }

  switch (action) {
    case 'Program':
      return (
        <Callout color="primary" icon="Done">
          <div>
            {toLowerCaseExceptFirst(cardRole)} card programmed.
            {newPin ? (
              <React.Fragment>
                <br />
                <H3>Record the new PIN:</H3>
                <CardPin>{hyphenatePin(newPin)}</CardPin>
                <br />
                Remove card to continue.
              </React.Fragment>
            ) : (
              <React.Fragment> Remove card to continue.</React.Fragment>
            )}
          </div>
        </Callout>
      );

    case 'PinReset': {
      assert(newPin !== undefined);
      return (
        <Callout color="primary" icon="Done">
          <div>
            {toLowerCaseExceptFirst(cardRole)} card PIN reset.
            <br />
            <H3>Record the new PIN:</H3>
            <CardPin>{hyphenatePin(newPin)}</CardPin>
            <br />
            Remove card to continue.
          </div>
        </Callout>
      );
    }

    case 'Unprogram':
      return (
        <Callout color="primary" icon="Done">
          {toLowerCaseExceptFirst(cardRole)} card unprogrammed.
        </Callout>
      );

    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(action);
    }
  }
}

export function ElectionInfo({
  election,
}: {
  election: Election;
}): JSX.Element {
  return (
    <React.Fragment>
      {election.title}
      <br />
      {format.localeWeekdayAndDate(
        election.date.toMidnightDatetimeWithSystemTimezone()
      )}
    </React.Fragment>
  );
}

interface ConfirmSystemAdminCardAction {
  actionType: 'Program' | 'PinReset';
  doAction: VoidFunction;
}

export function ConfirmSystemAdminCardActionModal({
  actionType,
  doAction,
  onClose,
}: ConfirmSystemAdminCardAction & { onClose: VoidFunction }): JSX.Element {
  const { title, content, confirmLabel } = (() => {
    switch (actionType) {
      case 'Program':
        return {
          title: 'Program System Administrator Card',
          content: (
            <React.Fragment>
              <P>System administrator cards have full system access.</P>
              <P>
                Limit the number of system administrator cards and keep them
                secure.
              </P>
            </React.Fragment>
          ),
          confirmLabel: 'Program System Administrator Card',
        };

      case 'PinReset':
        return {
          title: 'Reset System Administrator Card PIN',
          content: (
            <P>
              The old PIN will no longer work. After resetting the PIN, you must
              record the new PIN to avoid being locked out of this machine.
            </P>
          ),
          confirmLabel: 'Reset System Administrator Card PIN',
        };

      default: {
        /* istanbul ignore next - @preserve */
        throwIllegalValue(actionType);
      }
    }
  })();

  return (
    <Modal
      onOverlayClick={onClose}
      title={
        <span>
          <Icons.Warning color="warning" /> {title}
        </span>
      }
      content={content}
      actions={
        <React.Fragment>
          <Button
            onPress={() => {
              doAction();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
    />
  );
}
