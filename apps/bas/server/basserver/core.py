
from flask import Flask, send_from_directory

STATIC_DIR = "../../build"

app = Flask(__name__, static_folder=STATIC_DIR)

@app.route('/')
def root():
    return app.send_static_file('index.html')

@app.route('/<path:path>')
def send_static(path):
    return send_from_directory(STATIC_DIR, path)

