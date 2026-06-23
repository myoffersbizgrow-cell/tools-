import os
import subprocess
import shutil
import zipfile
import urllib.request
import time
import re
from pathlib import Path
from flask import Flask, request, render_template, send_file, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200MB

# ✅ Java path - ./java folder mein install hoga
BASE_DIR = Path(__file__).parent
JAVA_HOME = BASE_DIR / "java" / "jdk-17.0.12+7"
JAVA = str(JAVA_HOME / "bin" / "java")

# ✅ If Java not found, fallback to system
if not os.path.exists(JAVA):
    JAVA = "java"
    if not os.path.exists("/usr/bin/java"):
        print("⚠️ Java not found! Using system default.")

print(f"✅ Using Java: {JAVA}")

# Folders
TOOLS_DIR = BASE_DIR / "tools"
UPLOADS_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "output"
TEMP_DIR = BASE_DIR / "temp"

for folder in [UPLOADS_DIR, OUTPUT_DIR, TEMP_DIR, TOOLS_DIR]:
    folder.mkdir(exist_ok=True)

# Tool paths
APKTOOL = TOOLS_DIR / "apktool.jar"
AAPT2 = TOOLS_DIR / "aapt2"
BUNDLETOOL = TOOLS_DIR / "bundletool.jar"
ANDROID_JAR = TOOLS_DIR / "android.jar"

def run_cmd(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise Exception(result.stderr)
    return result.stdout

# ... (baaki sab functions same rahenge)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/health')
def health():
    return jsonify({
        'status': 'OK',
        'java': os.path.exists(JAVA),
        'tools': {
            'apktool': APKTOOL.exists(),
            'aapt2': AAPT2.exists(),
            'bundletool': BUNDLETOOL.exists()
        }
    })

@app.route('/api/convert', methods=['POST'])
def convert():
    try:
        if 'apk' not in request.files:
            return jsonify({'error': 'No APK file'}), 400
        
        file = request.files['apk']
        if not file.filename.endswith('.apk'):
            return jsonify({'error': 'Invalid file type'}), 400
        
        apk_path = UPLOADS_DIR / f"{int(time.time())}_{secure_filename(file.filename)}"
        file.save(apk_path)
        
        min_sdk = int(request.form.get('minSdk', 21))
        target_sdk = int(request.form.get('targetSdk', 33))
        
        output_dir = OUTPUT_DIR / str(int(time.time()))
        output_dir.mkdir(exist_ok=True)
        
        # ✅ Conversion logic
        aab_path, apk_file = convert_apk(apk_path, output_dir, min_sdk, target_sdk)
        
        apk_path.unlink()
        
        return jsonify({
            'success': True,
            'aab': aab_path.name,
            'download_url': f'/download/{aab_path.name}',
            'size': aab_path.stat().st_size
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download/<filename>')
def download(filename):
    for folder in OUTPUT_DIR.iterdir():
        if folder.is_dir():
            file_path = folder / filename
            if file_path.exists():
                return send_file(file_path, as_attachment=True)
    return jsonify({'error': 'File not found'}), 404

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
