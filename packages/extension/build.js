const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

console.log('Packaging DPF WebExtension...');

const EXT_ID = 'gpplglnoeigamjdeljfbgkkpikmmjjao';
const distDir = path.resolve(__dirname, '../../dist/extension');
const homeExtDir = path.join(os.homedir(), '.dpf', 'extension');
const pemKeyPath = path.resolve(__dirname, '../../build/dpf-extension.pem');

// Create directories
for (const d of [distDir, homeExtDir]) {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
}

// Copy files
const filesToCopy = [
  'manifest.json',
  'background.js',
  'content.js',
  'styles.css'
];

for (const file of filesToCopy) {
  const src = path.resolve(__dirname, file);
  fs.copyFileSync(src, path.join(distDir, file));
  fs.copyFileSync(src, path.join(homeExtDir, file));
}

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(element => {
    const stat = fs.lstatSync(path.join(from, element));
    if (stat.isFile()) {
      fs.copyFileSync(path.join(from, element), path.join(to, element));
    } else if (stat.isDirectory()) {
      copyFolderSync(path.join(from, element), path.join(to, element));
    }
  });
}

for (const folder of ['icons', 'popup']) {
  copyFolderSync(path.resolve(__dirname, folder), path.join(distDir, folder));
  copyFolderSync(path.resolve(__dirname, folder), path.join(homeExtDir, folder));
}

// Build CRX using Chromium pack-extension if available
const browserExes = [
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'brave-browser'
];

let packedCrx = false;
if (fs.existsSync(pemKeyPath)) {
  for (const exe of browserExes) {
    if (fs.existsSync(exe)) {
      try {
        console.log(`Packing CRX using ${path.basename(exe)}...`);
        execSync(`"${exe}" --pack-extension="${homeExtDir}" --pack-extension-key="${pemKeyPath}"`, { stdio: 'ignore' });
        const generatedCrx = path.join(path.dirname(homeExtDir), 'extension.crx');
        if (fs.existsSync(generatedCrx)) {
          const targetCrx = path.join(homeExtDir, 'dpf-extension.crx');
          const distCrx = path.join(distDir, 'dpf-extension.crx');
          fs.copyFileSync(generatedCrx, targetCrx);
          fs.copyFileSync(generatedCrx, distCrx);
          fs.unlinkSync(generatedCrx);
          packedCrx = true;
          console.log('Successfully created dpf-extension.crx at:', targetCrx);
          break;
        }
      } catch (e) {
        console.warn('Pack crx attempt note:', e.message);
      }
    }
  }
}

// Create portable ZIP for 1-click unpacked extension installation
try {
  const zipPath = path.resolve(__dirname, '../../dist/dpf-extension.zip');
  if (process.platform === 'win32') {
    execSync(`powershell -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'ignore' });
  } else {
    execSync(`cd "${distDir}" && zip -r "${zipPath}" ./*`, { stdio: 'ignore' });
  }
  console.log('Successfully created dpf-extension.zip at:', zipPath);
} catch (e) {
  console.warn('Zip creation note:', e.message);
}

console.log('DPF WebExtension deployed to:');
console.log(' - Dist:', distDir);
console.log(' - User Profile:', homeExtDir);
if (packedCrx) console.log(' - Packed CRX available with ID:', EXT_ID);
