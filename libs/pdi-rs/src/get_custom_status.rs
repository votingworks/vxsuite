use std::time::Duration;

use crate::custom::protocol::{
    JobCreateRequest, JobEndRequest, ReleaseType, ReleaseVersionRequest, StatusInternalRequest,
};

mod custom;

const CUSTOM_VENDOR_ID: u16 = 0x0dd4;
const CUSTOM_PRODUCT_ID: u16 = 0x4103;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let context = rusb::Context::new().unwrap();

    let (device, descriptor, mut handle) =
        open_device(&context, CUSTOM_VENDOR_ID, CUSTOM_PRODUCT_ID)?;

    // println!("device: {:?}", device);
    // for index in 0..descriptor.num_configurations() {
    //     println!("config: {:?}", device.config_descriptor(index));

    //     for interface in device.config_descriptor(index).unwrap().interfaces() {
    //         println!("interface: {}", interface.number());
    //         for descriptor in interface.descriptors() {
    //             println!("  descriptor: {:?}", descriptor);
    //             for endpoint in descriptor.endpoint_descriptors() {
    //                 println!("    endpoint: {:?}", endpoint);
    //             }
    //         }
    //     }
    // }

    println!("about to set active configuration");
    handle.set_active_configuration(1)?;
    println!("about to claim interface");
    handle.claim_interface(0)?;

    // println!("about to clear halt on endpoint 1");
    // handle.clear_halt(1)?;

    let release_version_request = ReleaseVersionRequest::new(ReleaseType::Model);
    let status_request = StatusInternalRequest::new(0x01);
    let job_create_request = JobCreateRequest::new();
    let job_end_request = JobEndRequest::new(0x01);
    let request = job_end_request;
    let request = job_create_request;
    // let request = release_version_request;
    let request = status_request;
    let written = handle.write_bulk(2, &request.to_bytes(), Duration::from_secs(1))?;
    println!(
        "wrote {written} bytes: {request:02x?}",
        request = request.to_bytes()
    );

    const BUFFER_SIZE: usize = 100;
    let mut buffer = [0u8; BUFFER_SIZE];

    println!("reading response");
    let read = handle.read_bulk(129, &mut buffer, Duration::from_secs(1))?;
    println!("read {read} bytes: {buffer:?}");
    let response = request.parse_response(&buffer);
    println!("response: {:?}", response);

    Ok(())
}

fn open_device<T: rusb::UsbContext>(
    context: &T,
    vid: u16,
    pid: u16,
) -> rusb::Result<(
    rusb::Device<T>,
    rusb::DeviceDescriptor,
    rusb::DeviceHandle<T>,
)> {
    let devices = context.devices()?;

    for device in devices.iter() {
        let device_desc = match device.device_descriptor() {
            Ok(d) => d,
            Err(_) => continue,
        };

        if device_desc.vendor_id() == vid && device_desc.product_id() == pid {
            let handle = device.open()?;
            return Ok((device, device_desc, handle));
        }
    }

    Err(rusb::Error::NotFound)
}
