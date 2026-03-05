fn main() {
    if std::env::var("CARGO_FEATURE_NAPI_BINDING").is_ok() {
        napi_build::setup();
    }
}
