use std::io::{Error, ErrorKind};

pub trait UsbConnection: Send + Sync {
    fn reset(&mut self) -> Result<(), Error>;
}

pub struct RealConnection(nusb::Device);
impl UsbConnection for RealConnection {
    fn reset(&mut self) -> Result<(), Error> {
        self.0.reset().map_err(|e| Error::new(ErrorKind::Other, e))
    }
}

pub trait UsbDevice: Send + Sync {
    fn vendor_id(&self) -> u16;
    fn product_id(&self) -> u16;
    fn open(&self) -> Result<Box<dyn UsbConnection>, Error>;
}

pub struct RealDevice(nusb::DeviceInfo);

impl UsbDevice for RealDevice {
    fn vendor_id(&self) -> u16 {
        self.0.vendor_id()
    }

    fn product_id(&self) -> u16 {
        self.0.product_id()
    }

    fn open(&self) -> Result<Box<dyn UsbConnection>, Error> {
        let d = self.0.clone(); // or however you get ownership
        Ok(Box::new(RealConnection(d.open()?)))
    }
}

#[cfg_attr(test, mockall::automock)]
pub trait UsbLister: Send + Sync + 'static {
    fn list_devices(&self) -> Result<Vec<Box<dyn UsbDevice>>, Error>;
}

pub struct SimpleUsbLister;
impl UsbLister for SimpleUsbLister {
    fn list_devices(&self) -> Result<Vec<Box<dyn UsbDevice>>, Error> {
        Ok(nusb::list_devices()?
            .map(RealDevice)
            .map(|d| Box::new(d) as Box<dyn UsbDevice>)
            .collect::<Vec<_>>())
    }
}
