use anyhow::Result;
use crossterm::{
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};

mod app;
mod config;
mod log;
mod run;
mod ui;
mod update;

fn startup() -> Result<()> {
    enable_raw_mode()?;
    execute!(std::io::stderr(), EnterAlternateScreen)?;
    Ok(())
}

fn shutdown() -> Result<()> {
    execute!(std::io::stderr(), LeaveAlternateScreen)?;
    disable_raw_mode()?;
    Ok(())
}

fn main() -> Result<()> {
    // setup terminal
    startup()?;

    let result = run::run();

    // teardown terminal before unwrapping Result of app run
    shutdown()?;

    result
}
