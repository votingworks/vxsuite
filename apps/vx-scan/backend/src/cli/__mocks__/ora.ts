import { Ora } from 'ora';

// This is emulating an existing 3rd party API, so we need to follow suit.
// eslint-disable-next-line vx/gts-no-default-exports
export default function ora(): Ora {
  return {
    clear: jest.fn().mockReturnThis(),
    color: 'black',
    fail: jest.fn().mockReturnThis(),
    frame: jest.fn().mockReturnThis(),
    indent: 2,
    info: jest.fn().mockReturnThis(),
    isSpinning: false,
    prefixText: '',
    render: jest.fn().mockReturnThis(),
    spinner: 'dots',
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    stopAndPersist: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    text: '',
    warn: jest.fn().mockReturnThis(),
  };
}
