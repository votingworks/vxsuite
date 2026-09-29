import '@votingworks/fixtures/vitest-setup';
import '@votingworks/image-utils/vitest-setup';
import '@votingworks/printing/vitest-setup';
import { setGracefulCleanup } from 'tmp';

// ensure tmp files are cleaned up
setGracefulCleanup();
