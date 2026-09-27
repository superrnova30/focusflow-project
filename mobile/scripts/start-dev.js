/**
 * Start Expo using the real Wi-Fi address so Expo Go can reach Metro.
 * Windows often advertises a 169.254.* or VirtualBox adapter instead.
 */
const { spawn } = require("child_process");
const os = require("os");

function pickLanIPv4() {
  const interfaces = os.networkInterfaces();
  const preferred = [];
  const fallback = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses || []) {
      const family = address.family === 4 || address.family === "IPv4";
      if (!family || address.internal) continue;
      if (address.address.startsWith("169.254.")) continue;
      const entry = { name, address: address.address };
      if (/wi-?fi|wireless|wlan/i.test(name)) preferred.push(entry);
      else fallback.push(entry);
    }
  }

  return preferred[0] || fallback[0] || null;
}

const lan = pickLanIPv4();
if (lan) {
  process.env.REACT_NATIVE_PACKAGER_HOSTNAME = lan.address;
  console.log(`Expo Go host: ${lan.address} (${lan.name})`);
} else {
  console.warn("No LAN IPv4 found. Expo Go may need: npm run start:tunnel");
}

const child = spawn(
  "npx",
  ["expo", "start", "--lan", ...process.argv.slice(2)],
  { stdio: "inherit", shell: true, env: process.env }
);

child.on("exit", (code) => process.exit(code ?? 0));
