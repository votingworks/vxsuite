// Constants for Origin Swifty USB switch integration
export const ORIGIN_VENDOR_ID = 0x0a95;
export const ORIGIN_SWIFTY_PRODUCT_ID = 0x0012;

// Constants for built-in 3.5mm jack GPIO integration
export const PAT_CONNECTION_STATUS_PIN = 478;
export const PATH_TO_PAT_CONNECTION_STATUS_PIN = `/sys/class/gpio/gpio${PAT_CONNECTION_STATUS_PIN}/value`;
