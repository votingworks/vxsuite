{
    "targets": [
        {
            "target_name": "lsd",
            "cflags!": ["-fno-exceptions"],
            "cflags_cc!": ["-fno-exceptions"],
            "sources": ["src/addon.cpp", "src/lsd.cpp"],
            "include_dirs": [
                "<!@(node -p \"require('node-addon-api').include\")",
                "src",
            ],
            "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
        }
    ]
}