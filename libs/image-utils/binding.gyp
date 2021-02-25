{
    "targets": [
        {
            "target_name": "addon",
            "cflags!": ["-fno-exceptions"],
            "cflags_cc!": ["-fno-exceptions"],
            "sources": ["addon/addon.cc", "addon/resize.cc", "addon/grayscale.cc"],
            "include_dirs": [
                "<!@(node -p \"require('node-addon-api').include\")",
                "addon",
            ],
            "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
        }
    ]
}