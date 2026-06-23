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
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024

# ✅ Set Java path
JAVA_HOME = os.environ.get('JAVA_HOME', '/opt/java/jdk-17.0.12+7')
JAVA = f"{JAVA_HOME}/bin/java"

# ✅ Check if Java exists, fallback to system java
if not os.path.exists(JAVA):
    JAVA = "java"
    if not os.path.exists("/usr/bin/java"):
        print("❌ Java not found!")

print(f"✅ Using Java: {JAVA}")

# Folders
BASE_DIR = Path(__file__).parent
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
    """Run command and return output"""
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise Exception(f"Command failed: {result.stderr}")
    return result.stdout

def decompile_apk(apk_path, output_dir):
    run_cmd([JAVA, "-jar", str(APKTOOL), "d", str(apk_path), "-o", str(output_dir), "-f"])

def extract_dex(apk_path, output_dir):
    count = 0
    with zipfile.ZipFile(apk_path, 'r') as zf:
        for name in zf.namelist():
            if name.endswith('.dex'):
                data = zf.read(name)
                with open(Path(output_dir) / Path(name).name, 'wb') as f:
                    f.write(data)
                count += 1
    return count

def fix_public_xml(path):
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    filtered = [l for l in lines if not ('<public' in l and '$' in l)]
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(filtered)

def fix_manifest(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    content = re.sub(r'<queries>.*?</queries>', '', content, flags=re.DOTALL)
    content = re.sub(r'<property[^>]*/>', '', content)
    if 'android:hasCode' not in content:
        content = content.replace('<application', '<application android:hasCode="true"')
    content = '\n'.join([l for l in content.split('\n') if l.strip()])
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def compile_resources(decompile_dir, output_zip):
    res_dir = decompile_dir / "res"
    public_xml = decompile_dir / "res" / "values" / "public.xml"
    if public_xml.exists():
        fix_public_xml(public_xml)
    run_cmd([str(AAPT2), "compile", "--dir", str(res_dir), "-o", str(output_zip)])

def link_resources(decompile_dir, res_zip, output_zip, min_sdk, target_sdk):
    manifest = decompile_dir / "AndroidManifest.xml"
    fix_manifest(manifest)
    run_cmd([
        str(AAPT2), "link",
        "--proto-format", "-o", str(output_zip),
        "-I", str(ANDROID_JAR),
        "--manifest", str(manifest),
        f"--min-sdk-version", str(min_sdk),
        f"--target-sdk-version", str(target_sdk),
        "--version-code", "1",
        "--version-name", "1.0",
        "-R", str(res_zip),
        "--auto-add-overlay"
    ])

def restructure_zip(input_zip, output_zip, decompile_dir):
    extract_dir = input_zip.parent / "extracted"
    extract_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(input_zip, 'r') as zf:
        zf.extractall(extract_dir)
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as new_zip:
        manifest = extract_dir / "AndroidManifest.xml"
        if manifest.exists():
            new_zip.write(manifest, "manifest/AndroidManifest.xml")
        res = extract_dir / "res"
        if res.exists():
            for f in res.rglob('*'):
                if f.is_file():
                    new_zip.write(f, str(f.relative_to(extract_dir)))
        pb = extract_dir / "resources.pb"
        if pb.exists():
            new_zip.write(pb, "resources.pb")
        for dex in decompile_dir.glob("*.dex"):
            new_zip.write(dex, f"dex/{dex.name}")
    shutil.rmtree(extract_dir)

def build_aab(base_zip, output_aab):
    run_cmd([JAVA, "-jar", str(BUNDLETOOL), "build-bundle", "--modules=" + str(base_zip), "--output=" + str(output_aab)])

def build_apks(aab_path, output_apks):
    run_cmd([JAVA, "-jar", str(BUNDLETOOL), "build-apks", "--bundle=" + str(aab_path), "--output=" + str(output_apks), "--mode=universal"])
    extract_dir = output_apks.parent / "universal"
    extract_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(output_apks, 'r') as zf:
        zf.extractall(extract_dir)
    return extract_dir / "universal.apk"

def convert_apk(apk_path, output_dir, min_sdk=21, target_sdk=33):
    job_id = str(int(time.time()))
    work_dir = TEMP_DIR / job_id
    work_dir.mkdir(exist_ok=True)
    
    try:
        # 1. Decompile
        decompile_dir = work_dir / "decompiled"
        decompile_apk(apk_path, decompile_dir)
        
        # 2. Extract DEX
        dex_dir = work_dir / "dex"
        dex_dir.mkdir(exist_ok=True)
        extract_dex(apk_path, dex_dir)
        for dex in dex_dir.glob("*.dex"):
            shutil.copy(dex, decompile_dir / dex.name)
        
        # 3. Compile resources
        res_zip = work_dir / "res.zip"
        compile_resources(decompile_dir, res_zip)
        
        # 4. Link
        base_zip = work_dir / "base.zip"
        link_resources(decompile_dir, res_zip, base_zip, min_sdk, target_sdk)
        
        # 5. Restructure
        restructured = work_dir / "restructured.zip"
        restructure_zip(base_zip, restructured, decompile_dir)
        
        # 6. Build AAB
        aab_path = output_dir / f"{apk_path.stem}.aab"
        build_aab(restructured, aab_path)
        
        # 7. Build APK
        apks_path = output_dir / f"{apk_path.stem}.apks"
        universal_apk = build_apks(aab_path, apks_path)
        
        shutil.rmtree(work_dir)
        return aab_path, universal_apk
        
    except Exception as e:
        shutil.rmtree(work_dir)
        raise e

# Routes
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
