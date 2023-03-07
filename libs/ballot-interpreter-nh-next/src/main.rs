extern crate log;
extern crate pretty_env_logger;

use std::env;
use std::path::Path;
use std::process::exit;

use clap::{arg, command, Command};
use serde::Serialize;

use crate::ballot_card::load_oval_template;
use crate::election::Election;
use crate::interpret::{interpret_ballot_card, Options};

mod ballot_card;
mod debug;
mod election;
mod geometry;
mod image_utils;
mod interpret;
mod metadata;
mod timing_marks;
mod types;

#[derive(Debug, Serialize)]
enum Error {
    InvalidElectionDefinition { message: String },
    OvalTemplateReadFailure { message: String },
    InterpretFailure(Box<crate::interpret::Error>),
    SerializationFailure { message: String },
}

fn try_main() -> Result<(), Box<Error>> {
    pretty_env_logger::init_custom_env("LOG");

    let matches = cli().get_matches();
    let debug = matches.get_flag("debug");
    let side_a_path = matches
        .get_one::<String>("side_a_path")
        .expect("side A image path is required");
    let side_b_path = matches
        .get_one::<String>("side_b_path")
        .expect("side B image path is required");
    let election_definition_path = matches
        .get_one::<String>("election")
        .expect("election path is required");

    let election_definition_json = match std::fs::read_to_string(election_definition_path) {
        Ok(json) => json,
        Err(e) => {
            return Err(Box::new(Error::InvalidElectionDefinition {
                message: format!("Error reading election definition: {e}"),
            }));
        }
    };

    // parse contents of election_definition_path with serde_json
    let election: Election = match serde_json::from_str(&election_definition_json) {
        Ok(election_definition) => election_definition,
        Err(e) => {
            return Err(Box::new(Error::InvalidElectionDefinition {
                message: format!("Error parsing election definition: {e}"),
            }));
        }
    };

    let oval_template = match load_oval_template() {
        Some(template) => template,
        None => {
            return Err(Box::new(Error::OvalTemplateReadFailure {
                message: "Error loading oval template".to_string(),
            }));
        }
    };

    let options = Options {
        debug,
        oval_template,
        election,
    };

    let card =
        match interpret_ballot_card(Path::new(&side_a_path), Path::new(&side_b_path), &options) {
            Ok(card) => card,
            Err(error) => {
                return Err(Box::new(Error::InterpretFailure(Box::new(error))));
            }
        };

    // use serde_json to serialize the ballot card to JSON
    let card_json = match serde_json::to_string_pretty(&card) {
        Ok(json) => json,
        Err(error) => {
            return Err(Box::new(Error::SerializationFailure {
                message: format!("Error serializing ballot card: {error}"),
            }));
        }
    };

    println!("{card_json}");
    Ok(())
}

fn main() {
    if let Err(error) = try_main() {
        println!(
            "{}",
            serde_json::to_string_pretty(&error).expect("Error serializing error")
        );
        exit(1);
    }
}

#[allow(clippy::cognitive_complexity)]
fn cli() -> Command {
    command!()
        .arg(arg!(-e --election <PATH> "Path to election.json file").required(true))
        .arg(arg!(-d --debug "Enable debug mode"))
        .arg(arg!(side_a_path: <SIDE_A_IMAGE> "Path to image for side A").required(true))
        .arg(arg!(side_b_path: <SIDE_B_IMAGE> "Path to image for side B").required(true))
}
