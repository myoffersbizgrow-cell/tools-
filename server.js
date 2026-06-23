import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs-extra';
import { exec } from 'child_process';
import util from 'util';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ✅ Java path
const BASE_DIR = __dirname;
const JAVA_HOME = path.join(BASE_DIR, 'java', 'jdk-17.0.12+7');
const JAVA = path.join(JAVA_HOME, 'bin', 'java');
const JAVA_CMD = fs.existsSync(JAVA) ? JAVA : 'java';
console.log(`✅ Using Java: ${JAVA_CMD}`);

// ✅ Verify Java (async function mein wrap)
async function verifyJava() {
  try {
    const execPromise = util.promisify(exec);
    const { stdout } = await execPromise(`${JAVA_CMD} -version`);
    console.log('✅ Java version:', stdout);
  } catch (error) {
    console.error('❌ Java not found!', error.message);
  }
}
await verifyJava();

// Folders
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

// ✅ Run command
async function runCmd(cmd, timeout = 600000) {
  try {
    const execPromise = util.promisify(exec);
    const env = { ...process.env };
    env.PATH = `${path.dirname(JAVA_CMD)}:${env.PATH}`;
    env.JAVA_HOME = path.dirname(path.dirname(JAVA_CMD));
    
    const { stdout, stderr } = await execPromise(cmd, { 
      timeout, 
      maxBuffer: 50 * 1024 * 1024,
      shell: '/bin/bash',
      env: env
    });
    if (stderr) console.warn('⚠️ stderr:', stderr);
    return stdout;
  } catch (error) {
    throw new Error(`Command failed: ${error.message}\n${error.stderr}`);
  }
}

// ✅ Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    java: fs.existsSync(JAVA_CMD),
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

// ✅ Convert endpoint
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
    
    // ✅ Conversion logic (simplified for test)
    const aabPath = path.join(outputDir, 'app.aab');
    fs.writeFileSync(aabPath, 'Test AAB content');
    
    // Clean up uploaded APK
    fs.removeSync(apkPath);
    
    res.json({
      success: true,
      aab: path.basename(aabPath),
      download_url: `/download/${path.basename(aabPath)}`,
      size: fs.statSync(aabPath).size
    });
    
  } catch (error) {
    console.error('❌ Conversion error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Download endpoint
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
  console.log(`✅ Java: ${JAVA_CMD}`);
});
