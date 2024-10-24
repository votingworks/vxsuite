fn main() {
    println!("cargo::rustc-check-cfg=cfg(production)");
    println!("cargo:rerun-if-env-changed=NODE_ENV");

    let is_production = match std::env::var("NODE_ENV") {
        Ok(env) => env == "production",
        Err(_) => false,
    };

    if is_production {
        println!("cargo:rustc-cfg=production");
    }
}
