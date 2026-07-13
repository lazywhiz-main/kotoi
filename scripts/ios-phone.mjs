import { execSync } from 'node:child_process';

/** iPhone シミュレータを起動してから Expo を開く（モックはスマホ基準） */
const PREFERRED = ['iPhone 16 Pro', 'iPhone 16', 'iPhone 15 Pro', 'iPhone 15'];

function listDevices() {
  const raw = execSync('xcrun simctl list devices available -j', { encoding: 'utf8' });
  const { devices } = JSON.parse(raw);
  const all = Object.values(devices).flat();
  return all.filter((d) => d.isAvailable && d.name.startsWith('iPhone'));
}

const iphones = listDevices();
if (iphones.length === 0) {
  console.error('利用可能な iPhone シミュレータが見つかりません。Xcode をインストールしてください。');
  process.exit(1);
}

const preferred =
  PREFERRED.map((name) => iphones.find((d) => d.name === name)).find(Boolean) ??
  iphones.find((d) => !d.name.includes('Max')) ??
  iphones[0];

try {
  execSync(`xcrun simctl boot "${preferred.udid}"`, { stdio: 'ignore' });
} catch {
  // already booted
}

execSync(`open -a Simulator --args -CurrentDeviceUDID ${preferred.udid}`, { stdio: 'inherit' });
console.log(`iPhone シミュレータ: ${preferred.name}`);
