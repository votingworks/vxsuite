/**
 * How long the "Printing" modal stays up after CUPS reports the job was sent to
 * the printer. The printer is still physically printing at that point, so
 * closing immediately would leave the screen looking idle mid-print.
 */
export const PRINT_HANDOFF_MODAL_LINGER_SECONDS = 3;
