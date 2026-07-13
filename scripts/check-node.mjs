const [major, minor, patch] = process.versions.node.split('.').map(Number);
const ok =
  major > 20 ||
  (major === 20 && minor > 19) ||
  (major === 20 && minor === 19 && patch >= 4);

if (!ok) {
  console.error('');
  console.error('KOTOI requires Node.js >= 20.19.4 (Expo 57).');
  console.error(`Current: v${process.versions.node}`);
  console.error('');
  console.error('Fix:');
  console.error('  nvm use');
  console.error('  npm start');
  console.error('');
  process.exit(1);
}
