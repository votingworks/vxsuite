use std::{io, time::Duration};

use color_eyre::eyre::{bail, ErrReport, Result};
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
    buffer: Vec<u8>,
    endpoint_in: Endpoint,
    endpoint_out: Endpoint,
    handle: DeviceHandle<Context>,
}

impl UsbDevice {
    fn open_device<T: UsbContext>(
        context: &T,
        vendor_id: u16,
        product_id: u16,
    ) -> Result<DeviceHandle<T>, ErrReport> {
        let Ok(devices) = context.devices() else {
            bail!("Could not list device");
        };

        for device in devices.iter() {
            let Ok(device_desc) = device.device_descriptor() else {
                continue;
            };

            if device_desc.vendor_id() == vendor_id && device_desc.product_id() == product_id {
                match device.open() {
                    Ok(handle) => return Ok(handle),
                    Err(e) => bail!("Device found but failed to open: {e}"),
                }
            }
        }

        bail!("could not find device {vendor_id:04x}:{product_id:04x}");
    }

    fn claim_interface<T: UsbContext>(handle: &mut DeviceHandle<T>) -> Result<()> {
        let has_kernel_driver = match handle.kernel_driver_active(INTERFACE_NUMBER) {
            Ok(true) => {
                let _ = handle.detach_kernel_driver(INTERFACE_NUMBER)?;
                true
            }
            _ => false,
        };

        handle.set_active_configuration(CONFIG_NUMBER)?;
        handle.claim_interface(INTERFACE_NUMBER)?;
        handle.set_alternate_setting(INTERFACE_NUMBER, SETTING_NUMBER)?;

        if has_kernel_driver {
            let _ = handle.attach_kernel_driver(INTERFACE_NUMBER)?;
        }
        Ok(())
    }

    pub fn open_and_claim(vendor_id: u16, product_id: u16) -> Result<Self, ErrReport> {
        let usb_context = Context::new().expect("Failed to create new USB context");

        let mut handle = Self::open_device(&usb_context, vendor_id, product_id)?;
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
            buffer: Vec::new(),
        })
    }
}

impl io::Write for UsbDevice {
    fn write(&mut self, buf: &[u8]) -> Result<usize, std::io::Error> {
        self.buffer.extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        let _ = self
            .handle
            .write_bulk(self.endpoint_out.address, &self.buffer, WRITE_TIMEOUT);
        Ok(())
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
