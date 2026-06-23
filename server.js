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

// ✅ Java path - Render build time wala use karein
const BASE_DIR = __dirname;
const JAVA_HOME = path.join(BASE_DIR, 'java', 'jdk-17.0.12+7');
const JAVA = path.join(JAVA_HOME, 'bin', 'java');

// ✅ Agar exist nahi karta toh system java try karein
const JAVA_CMD = fs.existsSync(JAVA) ? JAVA : 'java';
console.log(`✅ Using Java: ${JAVA_CMD}`);

// ✅ Verify Java
try {
  const { stdout } = await execPromise(`${JAVA_CMD} -version`);
  console.log('✅ Java version:', stdout);
} catch (error) {
  console.error('❌ Java not found!', error.message);
}

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

// ✅ Run command with timeout and Java path
async function runCmd(cmd, timeout = 600000) {
  try {
    // ✅ Ensure Java is in PATH
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

// ... (baaki sab functions same rahenge)

// ✅ Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    java: fs.existsSync(JAVA_CMD) || process.env.JAVA_HOME,
    tools: {
      apktool: fs.existsSync(APKTOOL),
      aapt2: fs.existsSync(AAPT2),
      bundletool: fs.existsSync(BUNDLETOOL),
      android_jar: fs.existsSync(ANDROID_JAR)
    }
  });
});

// ... (baaki sab routes)

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Java: ${JAVA_CMD}`);
});
