use clap::Parser;
use std::path::PathBuf;

mod html_to_typst;
mod preprocess;
mod world;

#[derive(Parser)]
#[command(name = "hmpb-render", about = "Render HMPB ballots to PDF via Typst")]
struct Cli {
    /// Path to election JSON file
    #[arg(short, long)]
    election: PathBuf,

    /// Ballot style ID
    #[arg(short = 's', long)]
    ballot_style: String,

    /// Precinct ID
    #[arg(short, long)]
    precinct: String,

    /// Ballot mode: official, test, or sample
    #[arg(short = 'm', long, default_value = "test")]
    ballot_mode: String,

    /// Output PDF path
    #[arg(short, long)]
    output: PathBuf,

    /// Path to the Typst template directory
    #[arg(short, long, default_value = "templates")]
    template_dir: PathBuf,

    /// Path to the fonts directory
    #[arg(short, long, default_value = "fonts")]
    font_dir: PathBuf,

    /// Path to the assets directory (SVG illustrations)
    #[arg(short, long, default_value = "assets")]
    asset_dir: PathBuf,

    /// Also extract bubble positions to JSON
    #[arg(long)]
    extract_grid: bool,

    /// Output path for grid positions JSON
    #[arg(long)]
    grid_output: Option<PathBuf>,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let t_start = std::time::Instant::now();

    // Read election data
    let election_json = std::fs::read_to_string(&cli.election)?;
    let election: serde_json::Value = serde_json::from_str(&election_json)?;

    // Preprocess: filter contests, convert HTML, compute pagination
    let template_data = preprocess::prepare_ballot_data(
        &election,
        &cli.ballot_style,
        &cli.precinct,
        &cli.ballot_mode,
        &cli.template_dir,
    )?;

    let t_preprocess = std::time::Instant::now();

    // Create the typst World with fonts
    let mut ballot_world = world::BallotWorld::new(&cli.font_dir)?;

    // Register data JSON as a virtual file
    let data_json = serde_json::to_string_pretty(&template_data)?;
    ballot_world.add_file("/ballot-data.json", data_json.into_bytes());

    // Register asset files (SVGs)
    let asset_dir = &cli.asset_dir;
    if asset_dir.is_dir() {
        for entry in std::fs::read_dir(asset_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                let name = path.file_name()
                    .and_then(|n| n.to_str())
                    .ok_or("Invalid asset filename")?;
                let data = std::fs::read(&path)?;
                ballot_world.add_file(&format!("/assets/{name}"), data);
            }
        }
    }

    // Register seal SVG if present
    if let Some(seal_svg) = election["seal"].as_str() {
        ballot_world.add_file("/seal.svg", seal_svg.as_bytes().to_vec());
    }

    // Read and set the Typst template source
    let template_path = cli.template_dir.join("ballot.typ");
    let template_source = std::fs::read_to_string(&template_path)?;
    ballot_world.set_source(&template_source);

    let t_world = std::time::Instant::now();

    // Compile the Typst document
    let document = typst::compile(&ballot_world)
        .output
        .map_err(|errs| {
            let msgs: Vec<String> = errs.iter().map(|e| format!("{e:?}")).collect();
            format!("Typst compilation failed:\n{}", msgs.join("\n"))
        })?;

    let t_compile = std::time::Instant::now();

    // Export to PDF
    let pdf_bytes = typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default())
        .map_err(|errs| {
            let msgs: Vec<String> = errs.iter().map(|e| format!("{e:?}")).collect();
            format!("PDF export failed:\n{}", msgs.join("\n"))
        })?;

    let t_pdf = std::time::Instant::now();

    std::fs::write(&cli.output, &pdf_bytes)?;

    eprintln!(
        "Wrote {} ({} bytes) in {:.0}ms (preprocess: {:.0}ms, world: {:.0}ms, compile: {:.0}ms, pdf: {:.0}ms)",
        cli.output.display(),
        pdf_bytes.len(),
        t_pdf.duration_since(t_start).as_secs_f64() * 1000.0,
        t_preprocess.duration_since(t_start).as_secs_f64() * 1000.0,
        t_world.duration_since(t_preprocess).as_secs_f64() * 1000.0,
        t_compile.duration_since(t_world).as_secs_f64() * 1000.0,
        t_pdf.duration_since(t_compile).as_secs_f64() * 1000.0,
    );

    // TODO: extract grid positions from document metadata labels
    if cli.extract_grid {
        eprintln!("Grid extraction not yet implemented for library mode");
    }

    Ok(())
}
