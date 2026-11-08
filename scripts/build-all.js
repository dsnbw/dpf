const { execSync } = require('node:child_process');
const path = require('node:path');

console.log('--- Step 1: Packaging WebExtension ---');
execSync('node packages/extension/build.js', { stdio: 'inherit' });

console.log('--- Step 2: Running Unit Tests ---');
execSync('npm test -w packages/core', { stdio: 'inherit' });
execSync('npm test -w packages/manager', { stdio: 'inherit' });
execSync('npm test -w packages/native-host', { stdio: 'inherit' });

console.log('--- All components built and verified successfully! ---');
