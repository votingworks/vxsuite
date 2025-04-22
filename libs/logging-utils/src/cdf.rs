use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Event {
    #[serde(rename = "@type")]
    pub object_type: EventType,
    #[serde(rename = "Description", skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "Details", skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    #[serde(rename = "Disposition")]
    pub disposition: EventDispositionType,
    #[serde(rename = "Hash", skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "OtherDisposition", skip_serializing_if = "Option::is_none")]
    pub other_disposition: Option<String>,
    #[serde(rename = "Sequence")]
    pub sequence: String,
    #[serde(rename = "Severity", skip_serializing_if = "Option::is_none")]
    pub severity: Option<String>,
    #[serde(rename = "TimeStamp")]
    pub time_stamp: String,
    #[serde(rename = "Type")]
    pub r#type: String,
    #[serde(rename = "UserId", skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub enum EventType {
    #[serde(rename = "EventLogging.Event")]
    Event,
}

#[derive(Serialize, Deserialize, PartialEq, Eq, Clone, Copy)]
pub enum EventDispositionType {
    #[serde(rename = "failure")]
    Failure,
    #[serde(rename = "na")]
    Na,
    #[serde(rename = "other")]
    Other,
    #[serde(rename = "success")]
    Success,
}

#[derive(Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct ElectionEventLog<Events>
where
    Events: Serialize,
{
    #[serde(rename = "@type")]
    pub object_type: ElectionEventLogType,
    pub generated_time: String,
    pub device: Vec<Device<Events>>,
}

#[derive(Serialize, Deserialize)]
pub enum ElectionEventLogType {
    #[serde(rename = "EventLogging.ElectionEventLog")]
    ElectionEventLog,
}

#[derive(Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct Device<Events>
where
    Events: Serialize,
{
    #[serde(rename = "@type")]
    pub object_type: DeviceType,

    /// Used to describe a logged event.
    pub event: Events,

    /// A serial number or otherwise identifier associated with the device.
    pub id: String,

    /// Manufacturer of the device.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manufacturer: Option<String>,

    /// Model of the device.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,

    /// If HashType is 'other', the type of the hash.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub other_hash_type: Option<String>,

    /// Used when Type is 'other'.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub other_type: Option<String>,

    /// Enumerated usage of the device, e.g., ems, scan-single, etc.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#type: Option<EventLoggingDeviceType>,

    /// Version identification of the device.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub enum DeviceType {
    #[serde(rename = "EventLogging.Device")]
    Device,
}

/// Used in Device::Type to describe the type or usage of the device generating the event.
#[derive(Serialize, Deserialize)]
pub enum EventLoggingDeviceType {
    /// Electronic adjudication function for reviewing absentee/mail-in ballots anomalies (blanks/overvotes/write-ins/unreadable ballots).
    #[serde(rename = "adjudication")]
    Adjudication,

    /// Devices for enabling a vote capture device (VCD) to display a ballot, possibly directly connected to the VCD or through a smart card interface.
    #[serde(rename = "ballot-activation")]
    BallotActivation,

    /// Marked ballot printing devices (voter facing).
    #[serde(rename = "ballot-printing")]
    BallotPrinting,

    /// On-demand blank ballot printers.
    #[serde(rename = "blank-ballot-printing")]
    BlankBallotPrinting,

    /// Ballot marking devices (voter facing).
    #[serde(rename = "bmd")]
    Bmd,

    /// Electronic voter stations, standalone or daisy chained to a DRE-controller (voter facing).
    #[serde(rename = "dre")]
    Dre,

    /// Network controller for electronic voting (poll worker facing).
    #[serde(rename = "dre-controller")]
    DreController,

    /// DREs, or other devices that store cast vote records electronically (voter facing).
    #[serde(rename = "electronic-cast")]
    ElectronicCast,

    /// DREs, or devices that store cast vote records electronically and also print a paper record (voter facing).
    #[serde(rename = "electronic-cast-paper")]
    ElectronicCastPaper,

    /// Electronic poll book devices.
    #[serde(rename = "electronic-poll-book")]
    ElectronicPollBook,

    /// Election management systems, including for pre- and post-election administration and reporting functions.
    #[serde(rename = "ems")]
    Ems,

    /// Used when no other value in this enumeration applies.
    #[serde(rename = "other")]
    Other,

    /// Scanning devices for batches of ballots, auto-feeding, e.g., Central Count (poll worker facing).
    #[serde(rename = "scan-batch")]
    ScanBatch,

    /// Scanning devices for single-sheets, e.g., Precinct Count (voter facing), but could be used for Central Count by an election official.
    #[serde(rename = "scan-single")]
    ScanSingle,

    /// Remote transmission hosts, e.g., for the receiving of unofficial results at a central location from a remote location (receiving station).
    #[serde(rename = "transmission-receiving")]
    TransmissionReceiving,

    /// Remote transmission clients, e.g., for sending of unofficial results from a remote location to a central location (sending station).
    #[serde(rename = "transmission-sending")]
    TransmissionSending,
}
