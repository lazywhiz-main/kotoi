import { execSync } from 'node:child_process';

/**
 * iPhone シミュレータを1台だけ起動してから Expo を開く。
 *
 * 使い方:
 *   node scripts/ios-phone.mjs              # 既定優先リスト
 *   node scripts/ios-phone.mjs "iPhone Air" # 端末名を指定
 *   IOS_SIMULATOR="iPhone Air" node scripts/ios-phone.mjs
 *
 * 6.5インチ系スクショ: iPhone Air
 */

const DEFAULT_PREFERRED = [
  'iPhone 14 Plus',
  'iPhone Air',
  'iPhone 16 Pro',
  'iPhone 16',
  'iPhone 15 Pro',
  'iPhone 15',
];

function listDevices() {
  const raw = execSync('xcrun simctl list devices available -j', { encoding: 'utf8' });
  const { devices } = JSON.parse(raw);
  const all = Object.values(devices).flat();
  return all.filter((d) => d.isAvailable && d.name.startsWith('iPhone'));
}

function shutdownOtherIphones(keepUdid, iphones) {
  for (const device of iphones) {
    if (device.udid === keepUdid) continue;
    if (device.state !== 'Booted') continue;
    try {
      execSync(`xcrun simctl shutdown "${device.udid}"`, { stdio: 'ignore' });
    } catch {
      // ignore
    }
  }
}

const iphones = listDevices();
if (iphones.length === 0) {
  console.error('利用可能な iPhone シミュレータが見つかりません。Xcode をインストールしてください。');
  process.exit(1);
}

const requested = (process.argv[2] || process.env.IOS_SIMULATOR || '').trim();
const preferredNames = requested ? [requested, ...DEFAULT_PREFERRED] : DEFAULT_PREFERRED;

const preferred =
  preferredNames.map((name) => iphones.find((d) => d.name === name)).find(Boolean) ??
  iphones.find((d) => !d.name.includes('Max')) ??
  iphones[0];

if (requested && preferred.name !== requested) {
  console.error(`シミュレータ「${requested}」が見つかりません。利用可能:`);
  for (const d of iphones) console.error(`  - ${d.name}`);
  process.exit(1);
}

// Expo が別端末を掴まないよう、使う1台以外は落とす
shutdownOtherIphones(preferred.udid, iphones);

try {
  execSync(`xcrun simctl boot "${preferred.udid}"`, { stdio: 'ignore' });
} catch {
  // already booted
}

execSync(`open -a Simulator --args -CurrentDeviceUDID ${preferred.udid}`, { stdio: 'inherit' });
console.log(`iPhone シミュレータ: ${preferred.name}`);
console.log(`UDID: ${preferred.udid}`);
