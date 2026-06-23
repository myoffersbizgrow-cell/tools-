import os, subprocess, shutil, zipfile, urllib.request, time, re
from pathlib import Path
from flask import Flask, request, render_template, send_file, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024

BASE_DIR = Path(__file__).parent

# ✅ Java path
JAVA = str(BASE_DIR / "java" / "jdk-17.0.12+7" / "bin" / "java")
if not os.path.exists(JAVA):
    JAVA = "java"

print(f"✅ Using Java: {JAVA}")

# Folders
TOOLS_DIR = BASE_DIR / "tools"
UPLOADS_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "output"
TEMP_DIR = BASE_DIR / "temp"

for f in [UPLOADS_DIR, OUTPUT_DIR, TEMP_DIR]:
    f.mkdir(exist_ok=True)

# Tools
APKTOOL = TOOLS_DIR / "apktool.jar"
AAPT2 = TOOLS_DIR / "aapt2"
BUNDLETOOL = TOOLS_DIR / "bundletool.jar"
ANDROID_JAR = TOOLS_DIR / "android.jar"

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        raise Exception(r.stderr)
    return r.stdout

def decompile(apk, out):
    run([JAVA, "-jar", str(APKTOOL), "d", str(apk), "-o", str(out), "-f"])

def extract_dex(apk, out):
    c = 0
    with zipfile.ZipFile(apk, 'r') as z:
        for n in z.namelist():
            if n.endswith('.dex'):
                with open(Path(out) / Path(n).name, 'wb') as f:
                    f.write(z.read(n))
                c += 1
    return c

def fix_public(p):
    with open(p, 'r') as f:
        lines = f.readlines()
    with open(p, 'w') as f:
        f.writelines([l for l in lines if not ('<public' in l and '$' in l)])

def fix_manifest(p):
    with open(p, 'r') as f:
        c = f.read()
    c = re.sub(r'<queries>.*?</queries>', '', c, flags=re.DOTALL)
    c = re.sub(r'<property[^>]*/>', '', c)
    if 'android:hasCode' not in c:
        c = c.replace('<application', '<application android:hasCode="true"')
    with open(p, 'w') as f:
        f.write('\n'.join([l for l in c.split('\n') if l.strip()]))

def compile_res(decompile_dir, out_zip):
    res_dir = decompile_dir / "res"
    pub = decompile_dir / "res" / "values" / "public.xml"
    if pub.exists():
        fix_public(pub)
    run([str(AAPT2), "compile", "--dir", str(res_dir), "-o", str(out_zip)])

def link_res(decompile_dir, res_zip, out_zip, min_sdk, target_sdk):
    manifest = decompile_dir / "AndroidManifest.xml"
    fix_manifest(manifest)
    run([
        str(AAPT2), "link", "--proto-format", "-o", str(out_zip),
        "-I", str(ANDROID_JAR), "--manifest", str(manifest),
        f"--min-sdk-version", str(min_sdk),
        f"--target-sdk-version", str(target_sdk),
        "--version-code", "1", "--version-name", "1.0",
        "-R", str(res_zip), "--auto-add-overlay"
    ])

def restructure(input_zip, output_zip, decompile_dir):
    extract_dir = input_zip.parent / "extracted"
    extract_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(input_zip, 'r') as z:
        z.extractall(extract_dir)
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as new:
        m = extract_dir / "AndroidManifest.xml"
        if m.exists():
            new.write(m, "manifest/AndroidManifest.xml")
        r = extract_dir / "res"
        if r.exists():
            for f in r.rglob('*'):
                if f.is_file():
                    new.write(f, str(f.relative_to(extract_dir)))
        pb = extract_dir / "resources.pb"
        if pb.exists():
            new.write(pb, "resources.pb")
        for d in decompile_dir.glob("*.dex"):
            new.write(d, f"dex/{d.name}")
    shutil.rmtree(extract_dir)

def build_aab(base_zip, out_aab):
    run([JAVA, "-jar", str(BUNDLETOOL), "build-bundle", "--modules=" + str(base_zip), "--output=" + str(out_aab)])

def build_apks(aab_path, out_apks):
    run([JAVA, "-jar", str(BUNDLETOOL), "build-apks", "--bundle=" + str(aab_path), "--output=" + str(out_apks), "--mode=universal"])
    extract_dir = out_apks.parent / "universal"
    extract_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(out_apks, 'r') as z:
        z.extractall(extract_dir)
    return extract_dir / "universal.apk"

def convert(apk_path, out_dir, min_sdk=21, target_sdk=33):
    job_id = str(int(time.time()))
    work_dir = TEMP_DIR / job_id
    work_dir.mkdir(exist_ok=True)
    try:
        decompile_dir = work_dir / "decompiled"
        decompile(apk_path, decompile_dir)
        dex_dir = work_dir / "dex"
        dex_dir.mkdir(exist_ok=True)
        extract_dex(apk_path, dex_dir)
        for d in dex_dir.glob("*.dex"):
            shutil.copy(d, decompile_dir / d.name)
        res_zip = work_dir / "res.zip"
        compile_res(decompile_dir, res_zip)
        base_zip = work_dir / "base.zip"
        link_res(decompile_dir, res_zip, base_zip, min_sdk, target_sdk)
        restructured = work_dir / "restructured.zip"
        restructure(base_zip, restructured, decompile_dir)
        aab_path = out_dir / f"{apk_path.stem}.aab"
        build_aab(restructured, aab_path)
        apks_path = out_dir / f"{apk_path.stem}.apks"
        universal_apk = build_apks(aab_path, apks_path)
        shutil.rmtree(work_dir)
        return aab_path, universal_apk
    except Exception as e:
        shutil.rmtree(work_dir)
        raise e

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
            'bundletool': BUNDLETOOL.exists(),
            'android_jar': ANDROID_JAR.exists()
        }
    })

@app.route('/api/convert', methods=['POST'])
def convert_api():
    try:
        if 'apk' not in request.files:
            return jsonify({'error': 'No APK'}), 400
        f = request.files['apk']
        if not f.filename.endswith('.apk'):
            return jsonify({'error': 'Invalid file'}), 400
        apk_path = UPLOADS_DIR / f"{int(time.time())}_{secure_filename(f.filename)}"
        f.save(apk_path)
        min_sdk = int(request.form.get('minSdk', 21))
        target_sdk = int(request.form.get('targetSdk', 33))
        out_dir = OUTPUT_DIR / str(int(time.time()))
        out_dir.mkdir(exist_ok=True)
        aab, apk = convert(apk_path, out_dir, min_sdk, target_sdk)
        apk_path.unlink()
        return jsonify({
            'success': True,
            'aab': aab.name,
            'download_url': f'/download/{aab.name}',
            'size': aab.stat().st_size
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download/<filename>')
def download(filename):
    for folder in OUTPUT_DIR.iterdir():
        if folder.is_dir():
            p = folder / filename
            if p.exists():
                return send_file(p, as_attachment=True)
    return jsonify({'error': 'Not found'}), 404

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
