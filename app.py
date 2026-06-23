import os
import subprocess
import shutil
import zipfile
import urllib.request
import time
import re
import tempfile
from pathlib import Path
from flask import Flask, request, render_template, send_file, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024

# Folders
BASE_DIR = Path(__file__).parent
TOOLS_DIR = BASE_DIR / "tools"
UPLOADS_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "output"
TEMP_DIR = BASE_DIR / "temp"

for folder in [UPLOADS_DIR, OUTPUT_DIR, TEMP_DIR, TOOLS_DIR]:
    folder.mkdir(exist_ok=True)

# ✅ Java path - Render default
JAVA = "java"
if os.path.exists("/usr/bin/java"):
    JAVA = "/usr/bin/java"
elif os.path.exists("/usr/lib/jvm/java-17-openjdk-amd64/bin/java"):
    JAVA = "/usr/lib/jvm/java-17-openjdk-amd64/bin/java"

# ✅ Download tools on startup
def download_tools():
    print("📦 Downloading Android tools...")
    tools = {
        "apktool.jar": "https://raw.githubusercontent.com/iBotPeaches/Apktool/master/scripts/windows/apktool.bat",
        "bundletool.jar": "https://github.com/google/bundletool/releases/download/1.16.1/bundletool-all-1.16.1.jar",
        "android.jar": "https://github.com/airwire/android-platforms/raw/main/android-33.jar",
        "aapt2": "https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/7.1.0-7984345/aapt2-7.1.0-7984345-linux.zip"
    }
    
    for filename, url in tools.items():
        target = TOOLS_DIR / filename
        if target.exists():
            continue
        print(f"  📥 Downloading {filename}...")
        try:
            if filename == "aapt2":
                zip_path = TOOLS_DIR / "aapt2.zip"
                urllib.request.urlretrieve(url, zip_path)
                with zipfile.ZipFile(zip_path, 'r') as zf:
                    zf.extractall(TOOLS_DIR)
                zip_path.unlink()
                os.chmod(TOOLS_DIR / "aapt2", 0o755)
            else:
                urllib.request.urlretrieve(url, target)
            print(f"  ✅ Downloaded {filename}")
        except Exception as e:
            print(f"  ❌ Failed: {e}")

# Download tools if needed
if not (TOOLS_DIR / "bundletool.jar").exists():
    download_tools()

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

# ... (baaki conversion functions same rahenge)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/health')
def health():
    return jsonify({
        'status': 'OK',
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
        
        # ✅ Conversion logic (same as before)
        # ... (conversion code)
        
        return jsonify({
            'success': True,
            'aab': "app.aab",
            'download_url': '/download/app.aab',
            'size': 12345
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
