const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

console.log('Packaging DPF WebExtension...');
const distDir = path.resolve(__dirname, '../../dist/extension');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy extension files to dist/extension
const filesToCopy = [
  'manifest.json',
  'background.js',
  'content.js',
  'styles.css'
];

for (const file of filesToCopy) {
  fs.copyFileSync(path.resolve(__dirname, file), path.join(distDir, file));
}

// Copy folders
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

copyFolderSync(path.resolve(__dirname, 'icons'), path.join(distDir, 'icons'));
copyFolderSync(path.resolve(__dirname, 'popup'), path.join(distDir, 'popup'));

console.log('DPF WebExtension packaged at:', distDir);
