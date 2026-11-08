const fs = require('fs');
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
  const content = fs.readFileSync(f, 'utf-8');
  const updated = content.replace('"version": "1.0.0"', '"version": "1.0.1"');
  fs.writeFileSync(f, updated, 'utf-8');
  console.log('Bumped', f, 'to 1.0.1');
});
