const fs = require('fs');
const targetVersion = process.argv[2] || '1.0.3';

const files = [
  'package.json',
  'packages/app/package.json',
  'packages/core/package.json',
  'packages/manager/package.json',
  'packages/native-host/package.json',
  'packages/extension/package.json',
  'packages/extension/manifest.json'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    const content = fs.readFileSync(f, 'utf-8');
    const updated = content.replace(/"version":\s*"[^"]+"/, `"version": "${targetVersion}"`);
    fs.writeFileSync(f, updated, 'utf-8');
    console.log(`Bumped ${f} to ${targetVersion}`);
  }
});
