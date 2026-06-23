const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ✅ Java path (Render ke hisaab se)
const JAVA = process.env.JAVA_HOME 
  ? path.join(process.env.JAVA_HOME, 'bin', 'java')
  : 'java';

console.log(`✅ Using Java: ${JAVA}`);

// Folders
const BASE_DIR = __dirname;
const TOOLS_DIR = path.join(BASE_DIR, 'tools');
const UPLOADS_DIR = path.join(BASE_DIR, 'uploads');
const OUTPUT_DIR = path.join(BASE_DIR, 'output');
const TEMP_DIR = path.join(BASE_DIR, 'temp');

[UPLOADS_DIR, OUTPUT_DIR, TEMP_DIR].forEach(dir => fs.ensureDirSync(dir));

// Tool paths
const APKTOOL = path.join(TOOLS_DIR, 'apktool.jar');
const AAPT2 = path.join(TOOLS_DIR, 'aapt2');
const BUNDLETOOL = path.join(TOOLS_DIR, 'bundletool.jar');
const ANDROID_JAR = path.join(TOOLS_DIR, 'android.jar');

// ✅ Run command with timeout
async function runCmd(cmd, timeout = 600000) {
  try {
    const { stdout, stderr } = await execPromise(cmd, { 
      timeout, 
      maxBuffer: 50 * 1024 * 1024,
      shell: '/bin/bash'
    });
    if (stderr) console.warn('⚠️ stderr:', stderr);
    return stdout;
  } catch (error) {
    throw new Error(`Command failed: ${error.message}\n${error.stderr}`);
  }
}

// ✅ Decompile APK
async function decompileApk(apkPath, outputDir) {
  const cmd = `${JAVA} -jar ${APKTOOL} d ${apkPath} -o ${outputDir} -f`;
  console.log('🔧 Decompiling APK...');
  await runCmd(cmd);
}

// ✅ Extract DEX files
async function extractDex(apkPath, outputDir) {
  console.log('🔧 Extracting DEX files...');
  const zip = new AdmZip(apkPath);
  const entries = zip.getEntries();
  let count = 0;
  for (const entry of entries) {
    if (entry.entryName.endsWith('.dex')) {
      const content = entry.getData();
      const fileName = path.basename(entry.entryName);
      fs.writeFileSync(path.join(outputDir, fileName), content);
      count++;
      console.log(`  ✅ Extracted ${fileName}`);
    }
  }
  console.log(`  ✅ Extracted ${count} DEX file(s)`);
  return count;
}

// ✅ Fix public.xml
function fixPublicXml(filePath) {
  if (!fs.existsSync(filePath)) return;
  console.log('🔧 Fixing public.xml...');
  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const filtered = lines.filter(line => !(line.includes('<public') && line.includes('$')));
  fs.writeFileSync(filePath, filtered.join('\n'), 'utf8');
  console.log('✅ public.xml fixed');
}

// ✅ Fix AndroidManifest.xml
function fixManifest(filePath) {
  if (!fs.existsSync(filePath)) return;
  console.log('🔧 Fixing AndroidManifest.xml...');
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/<queries>.*?<\/queries>/gs, '');
  content = content.replace(/<property[^>]*\/>/g, '');
  content = content.replace(/<property[^>]*>.*?<\/property>/gs, '');
  if (!content.includes('android:hasCode')) {
    content = content.replace('<application', '<application android:hasCode="true"');
  }
  const lines = content.split('\n').filter(line => line.trim());
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  console.log('✅ AndroidManifest.xml fixed');
}

// ✅ Compile resources
async function compileResources(decompileDir, outputZip) {
  const resDir = path.join(decompileDir, 'res');
  const publicXml = path.join(decompileDir, 'res', 'values', 'public.xml');
  if (fs.existsSync(publicXml)) fixPublicXml(publicXml);
  
  const cmd = `${AAPT2} compile --dir ${resDir} -o ${outputZip}`;
  console.log('🔧 Compiling resources...');
  await runCmd(cmd);
}

// ✅ Link resources
async function linkResources(decompileDir, resZip, outputZip, minSdk, targetSdk) {
  const manifest = path.join(decompileDir, 'AndroidManifest.xml');
  fixManifest(manifest);
  
  const cmd = `${AAPT2} link --proto-format -o ${outputZip} ` +
    `-I ${ANDROID_JAR} --manifest ${manifest} ` +
    `--min-sdk-version ${minSdk} --target-sdk-version ${targetSdk} ` +
    `--version-code 1 --version-name 1.0 -R ${resZip} --auto-add-overlay`;
  
  console.log('🔧 Linking resources...');
  await runCmd(cmd);
}

// ✅ Restructure zip for bundletool
function restructureZip(inputZip, outputZip, decompileDir) {
  console.log('🔧 Restructuring zip...');
  const extractDir = path.join(path.dirname(inputZip), 'extracted');
  fs.ensureDirSync(extractDir);
  
  const zip = new AdmZip(inputZip);
  zip.extractAllTo(extractDir, true);
  
  const newZip = new AdmZip();
  
  // Manifest
  const manifestSrc = path.join(extractDir, 'AndroidManifest.xml');
  if (fs.existsSync(manifestSrc)) {
    newZip.addFile('manifest/AndroidManifest.xml', fs.readFileSync(manifestSrc));
  }
  
  // Res folder
  const resSrc = path.join(extractDir, 'res');
  if (fs.existsSync(resSrc)) {
    const files = fs.readdirSync(resSrc);
    for (const file of files) {
      const filePath = path.join(resSrc, file);
      if (fs.statSync(filePath).isFile()) {
        newZip.addFile(`res/${file}`, fs.readFileSync(filePath));
      }
    }
  }
  
  // resources.pb
  const pbSrc = path.join(extractDir, 'resources.pb');
  if (fs.existsSync(pbSrc)) {
    newZip.addFile('resources.pb', fs.readFileSync(pbSrc));
  }
  
  // DEX files
  const dexFiles = fs.readdirSync(decompileDir).filter(f => f.endsWith('.dex'));
  for (const dex of dexFiles) {
    newZip.addFile(`dex/${dex}`, fs.readFileSync(path.join(decompileDir, dex)));
    console.log(`  ✅ Added dex/${dex}`);
  }
  
  newZip.writeZip(outputZip);
  fs.removeSync(extractDir);
  console.log('✅ Restructured zip created');
}

// ✅ Build AAB
async function buildAab(baseZip, outputAab) {
  const cmd = `${JAVA} -jar ${BUNDLETOOL} build-bundle --modules=${baseZip} --output=${outputAab}`;
  console.log('🔧 Building AAB...');
  await runCmd(cmd);
}

// ✅ Build APKS from AAB
async function buildApks(aabPath, outputApks) {
  const cmd = `${JAVA} -jar ${BUNDLETOOL} build-apks --bundle=${aabPath} --output=${outputApks} --mode=universal`;
  console.log('🔧 Building APKS...');
  await runCmd(cmd);
  
  // Extract universal APK
  const extractDir = path.join(path.dirname(outputApks), 'universal');
  fs.ensureDirSync(extractDir);
  const zip = new AdmZip(outputApks);
  zip.extractAllTo(extractDir, true);
  return path.join(extractDir, 'universal.apk');
}

// ✅ Main conversion function
async function convertApk(apkPath, outputDir, minSdk = 21, targetSdk = 33) {
  const jobId = uuidv4();
  const workDir = path.join(TEMP_DIR, jobId);
  fs.ensureDirSync(workDir);
  
  try {
    // 1. Decompile
    const decompileDir = path.join(workDir, 'decompiled');
    await decompileApk(apkPath, decompileDir);
    
    // 2. Extract DEX
    const dexDir = path.join(workDir, 'dex');
    fs.ensureDirSync(dexDir);
    await extractDex(apkPath, dexDir);
    const dexFiles = fs.readdirSync(dexDir).filter(f => f.endsWith('.dex'));
    for (const dex of dexFiles) {
      fs.copySync(path.join(dexDir, dex), path.join(decompileDir, dex));
    }
    
    // 3. Compile resources
    const resZip = path.join(workDir, 'res.zip');
    await compileResources(decompileDir, resZip);
    
    // 4. Link resources
    const baseZip = path.join(workDir, 'base.zip');
    await linkResources(decompileDir, resZip, baseZip, minSdk, targetSdk);
    
    // 5. Restructure
    const restructured = path.join(workDir, 'restructured.zip');
    restructureZip(baseZip, restructured, decompileDir);
    
    // 6. Build AAB
    const aabName = path.basename(apkPath, '.apk') + '.aab';
    const aabPath = path.join(outputDir, aabName);
    await buildAab(restructured, aabPath);
    
    // 7. Build APKS
    const apksName = path.basename(apkPath, '.apk') + '.apks';
    const apksPath = path.join(outputDir, apksName);
    const universalApk = await buildApks(aabPath, apksPath);
    
    // Cleanup
    fs.removeSync(workDir);
    
    return { aabPath, universalApk };
    
  } catch (error) {
    fs.removeSync(workDir);
    throw error;
  }
}

// ✅ Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    java: fs.existsSync(JAVA) || process.env.JAVA_HOME,
    tools: {
      apktool: fs.existsSync(APKTOOL),
      aapt2: fs.existsSync(AAPT2),
      bundletool: fs.existsSync(BUNDLETOOL),
      android_jar: fs.existsSync(ANDROID_JAR)
    }
  });
});

// ✅ Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.apk')) cb(null, true);
    else cb(new Error('Only APK files allowed'));
  }
});

app.post('/api/convert', upload.single('apk'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No APK file uploaded' });
    }
    
    const apkPath = req.file.path;
    const minSdk = parseInt(req.body.minSdk) || 21;
    const targetSdk = parseInt(req.body.targetSdk) || 33;
    
    const outputDir = path.join(OUTPUT_DIR, Date.now().toString());
    fs.ensureDirSync(outputDir);
    
    console.log(`📥 Converting: ${req.file.filename}`);
    console.log(`📊 Min SDK: ${minSdk}, Target SDK: ${targetSdk}`);
    
    const result = await convertApk(apkPath, outputDir, minSdk, targetSdk);
    
    // Clean up uploaded APK
    fs.removeSync(apkPath);
    
    res.json({
      success: true,
      aab: path.basename(result.aabPath),
      download_url: `/download/${path.basename(result.aabPath)}`,
      size: fs.statSync(result.aabPath).size
    });
    
  } catch (error) {
    console.error('❌ Conversion error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const folders = fs.readdirSync(OUTPUT_DIR);
  
  for (const folder of folders) {
    const filePath = path.join(OUTPUT_DIR, folder, filename);
    if (fs.existsSync(filePath)) {
      return res.download(filePath, (err) => {
        if (err) console.error('Download error:', err);
        setTimeout(() => fs.removeSync(path.dirname(filePath)), 5000);
      });
    }
  }
  
  res.status(404).json({ error: 'File not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
});
