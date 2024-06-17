use std::{io, time::Duration};

use color_eyre::eyre::Result;
use rusb::{Context, DeviceHandle, UsbContext};

const INTERFACE_NUMBER: u8 = 0x00;
const CONFIG_NUMBER: u8 = 0x01;
const SETTING_NUMBER: u8 = 0x00;
const ENDPOINT_ADDRESS_IN: u8 = 0x81;
const ENDPOINT_ADDRESS_OUT: u8 = 0x01;
const WRITE_TIMEOUT: Duration = Duration::from_secs(1);
const READ_TIMEOUT: Duration = Duration::from_millis(50);

#[derive(Debug)]
struct Endpoint {
    address: u8,
}

pub struct UsbDevice {
    endpoint_in: Endpoint,
    endpoint_out: Endpoint,
    handle: DeviceHandle<Context>,
}

impl UsbDevice {
    fn open_device<T: UsbContext>(
        context: &T,
        vendor_id: u16,
        product_id: u16,
    ) -> Option<DeviceHandle<T>> {
        let Ok(devices) = context.devices() else {
            return None;
        };

        for device in devices.iter() {
            let Ok(device_desc) = device.device_descriptor() else {
                continue;
            };

            if device_desc.vendor_id() == vendor_id && device_desc.product_id() == product_id {
                match device.open() {
                    Ok(handle) => return Some(handle),
                    Err(e) => panic!("Device found but failed to open: {e}"),
                }
            }
        }

        None
    }

    fn claim_interface<T: UsbContext>(handle: &mut DeviceHandle<T>) -> Result<()> {
        let has_kernel_driver = match handle.kernel_driver_active(INTERFACE_NUMBER) {
            Ok(true) => {
                handle.detach_kernel_driver(INTERFACE_NUMBER).ok();
                true
            }
            _ => false,
        };

        handle.set_active_configuration(CONFIG_NUMBER)?;
        handle.claim_interface(INTERFACE_NUMBER)?;
        handle.set_alternate_setting(INTERFACE_NUMBER, SETTING_NUMBER)?;

        if has_kernel_driver {
            handle.attach_kernel_driver(INTERFACE_NUMBER).ok();
        }
        Ok(())
    }

    pub fn write_bulk(&mut self, buf: &[u8]) -> Result<usize, rusb::Error> {
        self.handle
            .write_bulk(self.endpoint_out.address, buf, WRITE_TIMEOUT)
    }

    pub fn open_by_ids(vendor_id: u16, product_id: u16) -> color_eyre::Result<Self> {
        let usb_context = Context::new().expect("Failed to create new USB context");

        match Self::open_device(&usb_context, vendor_id, product_id) {
            Some(mut handle) => {
                Self::claim_interface(&mut handle)?;

                let endpoint_in = Endpoint {
                    address: ENDPOINT_ADDRESS_IN,
                };

                let endpoint_out = Endpoint {
                    address: ENDPOINT_ADDRESS_OUT,
                };

                Ok(Self {
                    endpoint_in,
                    endpoint_out,
                    handle,
                })
            }
            // TODO real error handling
            None => panic!("could not find device {vendor_id:04x}:{product_id:04x}"),
        }
    }
}

impl io::Read for UsbDevice {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        match self
            .handle
            .read_bulk(self.endpoint_in.address, buf, READ_TIMEOUT)
        {
            Ok(len) => Ok(len),
            Err(rusb::Error::Timeout) => {
                Err(io::Error::new(io::ErrorKind::TimedOut, "Read timed out"))
            }
            Err(err) => Err(io::Error::new(io::ErrorKind::Other, format!("{err:?}"))),
        }
    }
}
