const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const keyPath = path.resolve(__dirname, '../build/dpf-extension.pem');

let pem = '';
if (fs.existsSync(keyPath)) {
  pem = fs.readFileSync(keyPath, 'utf-8');
} else {
  console.log('Generating new 2048-bit RSA private key for DPF extension...');
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  pem = privateKey;
  fs.writeFileSync(keyPath, pem, 'utf-8');
}

const pubKeyDer = crypto.createPublicKey(pem).export({ type: 'spki', format: 'der' });
const pubKeyB64 = pubKeyDer.toString('base64');

// Calculate Chrome extension ID: first 128 bits of SHA256(der), mapped to a-p
const sha256 = crypto.createHash('sha256').update(pubKeyDer).digest('hex').slice(0, 32);
const extensionId = sha256.split('').map(c => String.fromCharCode(parseInt(c, 16) + 97)).join('');

console.log('=============================================');
console.log('DPF Extension ID:', extensionId);
console.log('Public Key (b64 length):', pubKeyB64.length);
console.log('=============================================');

// Update manifest.json with the public key
const manifestPath = path.resolve(__dirname, '../packages/extension/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
manifest.key = pubKeyB64;
manifest.version = '1.0.3';
manifest.permissions = [
  "downloads",
  "downloads.shelf",
  "nativeMessaging",
  "storage",
  "contextMenus",
  "tabs",
  "webRequest",
  "webNavigation",
  "scripting",
  "activeTab"
];
manifest.host_permissions = [
  "<all_urls>"
];

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
console.log('Updated manifest.json with key and permissions.');

module.exports = { extensionId, pubKeyB64, keyPath };
