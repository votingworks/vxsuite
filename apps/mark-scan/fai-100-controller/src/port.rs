use std::{io, time::Duration};

use color_eyre::eyre::Result;
use rusb::{Context, Device, DeviceDescriptor, DeviceHandle, Direction, TransferType, UsbContext};

#[derive(Debug)]
struct Endpoint {
    config: u8,
    iface: u8,
    setting: u8,
    address: u8,
}

pub struct Port {
    endpoint_in: Endpoint,
    endpoint_out: Endpoint,
    handle: DeviceHandle<Context>,
}

impl Port {
    fn open_device<T: UsbContext>(
        context: &mut T,
        vid: u16,
        pid: u16,
    ) -> Option<(Device<T>, DeviceDescriptor, DeviceHandle<T>)> {
        let devices = match context.devices() {
            Ok(d) => d,
            Err(_) => return None,
        };

        for device in devices.iter() {
            let device_desc = match device.device_descriptor() {
                Ok(d) => d,
                Err(_) => continue,
            };

            if device_desc.vendor_id() == vid && device_desc.product_id() == pid {
                match device.open() {
                    Ok(handle) => return Some((device, device_desc, handle)),
                    Err(e) => panic!("Device found but failed to open: {}", e),
                }
            }
        }

        None
    }

    fn find_endpoint<T: UsbContext>(
        device: &mut Device<T>,
        device_desc: &DeviceDescriptor,
        transfer_type: TransferType,
        direction: Direction,
    ) -> Option<Endpoint> {
        for n in 0..device_desc.num_configurations() {
            let config_desc = match device.config_descriptor(n) {
                Ok(c) => c,
                Err(_) => continue,
            };

            for interface in config_desc.interfaces() {
                for interface_desc in interface.descriptors() {
                    for endpoint_desc in interface_desc.endpoint_descriptors() {
                        if endpoint_desc.direction() == direction
                            && endpoint_desc.transfer_type() == transfer_type
                        {
                            return Some(Endpoint {
                                config: config_desc.number(),
                                iface: interface_desc.interface_number(),
                                setting: interface_desc.setting_number(),
                                address: endpoint_desc.address(),
                            });
                        }
                    }
                }
            }
        }

        None
    }

    fn claim_interface<T: UsbContext>(
        handle: &mut DeviceHandle<T>,
        endpoint: &Endpoint,
    ) -> Result<()> {
        let has_kernel_driver = match handle.kernel_driver_active(endpoint.iface) {
            Ok(true) => {
                handle.detach_kernel_driver(endpoint.iface).ok();
                true
            }
            _ => false,
        };
        println!(" - kernel driver? {}", has_kernel_driver);

        handle.set_active_configuration(endpoint.config)?;
        handle.claim_interface(endpoint.iface)?;
        handle.set_alternate_setting(endpoint.iface, endpoint.setting)?;

        if has_kernel_driver {
            handle.attach_kernel_driver(endpoint.iface).ok();
        }
        Ok(())
    }

    pub fn write_interrupt(&mut self, buf: &[u8]) -> Result<usize, rusb::Error> {
        println!("Writing to endpoint: {:?}", self.endpoint_out.address);

        let timeout = Duration::from_secs(1);

        self.handle
            .write_interrupt(self.endpoint_out.address, buf, timeout)
    }

    fn get_interrupt_endpoint<T: UsbContext>(
        device: &mut Device<T>,
        device_desc: &DeviceDescriptor,
        handle: &mut DeviceHandle<T>,
        direction: Direction,
    ) -> Result<Endpoint> {
        handle.reset()?;

        let timeout = Duration::from_secs(5);
        let languages = handle.read_languages(timeout)?;

        println!("Active configuration: {}", handle.active_configuration()?);
        println!("Languages: {:?}", languages);

        if !languages.is_empty() {
            let language = languages[0];

            println!(
                "Manufacturer: {:?}",
                handle
                    .read_manufacturer_string(language, device_desc, timeout)
                    .ok()
            );
            println!(
                "Product: {:?}",
                handle
                    .read_product_string(language, device_desc, timeout)
                    .ok()
            );
            println!(
                "Serial Number: {:?}",
                handle
                    .read_serial_number_string(language, device_desc, timeout)
                    .ok()
            );
        }

        match Self::find_endpoint(device, device_desc, TransferType::Interrupt, direction) {
            Some(endpoint) => Ok(endpoint),
            // TODO real error handling
            None => panic!("No interrupt endpoint for direction {:?}", direction),
        }
    }

    pub fn open_by_ids(vendor_id: u16, product_id: u16) -> color_eyre::Result<Self> {
        let mut usb_context = Context::new().unwrap();

        match Self::open_device(&mut usb_context, vendor_id, product_id) {
            Some((mut device, device_desc, mut handle)) => {
                let endpoint_in = Self::get_interrupt_endpoint(
                    &mut device,
                    &device_desc,
                    &mut handle,
                    Direction::In,
                )?;

                // Interface can be claimed only once for both endpoints
                Self::claim_interface(&mut handle, &endpoint_in)?;

                let endpoint_out = Self::get_interrupt_endpoint(
                    &mut device,
                    &device_desc,
                    &mut handle,
                    Direction::Out,
                )?;
                Ok(Self {
                    endpoint_in,
                    endpoint_out,
                    handle,
                })
            }
            // TODO real error handling
            None => panic!("could not find device {:04x}:{:04x}", vendor_id, product_id),
        }
    }
}

impl io::Read for Port {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        println!("Reading from endpoint: {:?}", self.endpoint_in.address);
        let timeout = Duration::from_millis(1);

        match self
            .handle
            .read_interrupt(self.endpoint_in.address, buf, timeout)
        {
            Ok(len) => {
                println!(" - read from interrupt endpoint: {:?}", &buf[..len]);
                Ok(len)
            }
            Err(rusb::Error::Timeout) => {
                Err(io::Error::new(io::ErrorKind::TimedOut, "Read timed out"))
            }
            Err(err) => Err(io::Error::new(io::ErrorKind::Other, format!("{:?}", err))),
        }
    }
}
