{
    "targets": [
        {
            "target_name": "lsd",
            "cflags!": ["-fno-exceptions"],
            "cflags_cc!": ["-fno-exceptions"],
            "sources": ["addon/addon.cpp", "addon/lsd.cpp"],
            "include_dirs": [
                "<!@(node -p \"require('node-addon-api').include\")",
                "addon",
            ],
            "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
        }
    ]
}