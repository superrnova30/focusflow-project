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
const port = (() => {
  const idx = process.argv.indexOf("--port");
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env.PORT || "8081";
})();

if (lan) {
  process.env.REACT_NATIVE_PACKAGER_HOSTNAME = lan.address;
  console.log(`Expo Go host: ${lan.address} (${lan.name})`);
  console.log("");
  console.log("========================================");
  console.log("  Open this in Expo Go (Enter URL):");
  console.log(`  exp://${lan.address}:${port}`);
  console.log("========================================");
  console.log("Do NOT scan an old development-build QR.");
  console.log("Use: npm start   (not bare npx expo start)");
  console.log("");
} else {
  console.warn("No LAN IPv4 found. Expo Go may need: npm run start:tunnel");
}

// Always target Expo Go unless the caller explicitly asks for a dev client.
// Development-client QR links (exp+focusflow://...) fail inside Expo Go with
// "Something went wrong".
const extraArgs = process.argv.slice(2);
const wantsDevClient = extraArgs.includes("--dev-client");
const goArgs = wantsDevClient || extraArgs.includes("--go") ? [] : ["--go"];

// --offline avoids Expo CLI crashing when it cannot reach expo.dev for
// dependency version checks. Do not combine with --lan/--tunnel (mutually exclusive).
process.env.EXPO_OFFLINE = process.env.EXPO_OFFLINE || "1";
process.env.EXPO_NO_DOCTOR = process.env.EXPO_NO_DOCTOR || "1";
// Windows file watchers often fail ("Failed to start watch mode"); polling is reliable.
process.env.CHOKIDAR_USEPOLLING = process.env.CHOKIDAR_USEPOLLING || "1";
process.env.EXPO_USE_FAST_RESOLVER = process.env.EXPO_USE_FAST_RESOLVER || "1";

const clearArgs = extraArgs.includes("--clear") || extraArgs.includes("-c") ? [] : ["--clear"];

const child = spawn(
  "npx",
  ["expo", "start", "--offline", ...goArgs, ...clearArgs, ...extraArgs],
  { stdio: "inherit", shell: true, env: process.env }
);

child.on("exit", (code) => process.exit(code ?? 0));
