// Constants for Origin Swifty USB switch integration
export const ORIGIN_VENDOR_ID = 0x0a95;
export const ORIGIN_SWIFTY_PRODUCT_ID = 0x0012;

// Constants for built-in 3.5mm jack GPIO integration
export const PAT_CONNECTION_STATUS_PIN = 478;
// More recent versions of Debian offset the expected GPIO addresses
// eg. the connection status pin is addressed at 478 + 512 = 990
export const PAT_GPIO_OFFSET = 512;

export const GPIO_PATH_PREFIX = '/sys/class/gpio';
export const FAI_100_STATUS_FILENAME = '_pat_connection.status';
