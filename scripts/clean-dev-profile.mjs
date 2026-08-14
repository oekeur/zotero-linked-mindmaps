#!/usr/bin/env node
// Cleans dev-profile state that causes silent breakage between npm start runs:
// - stale zotero-bin process left running after a crash or manifest error
//   (masks fixes because `zotero-plugin serve` reuses it instead of launching fresh)
// - leftover custom-tab entries in session.json for this addon's tab types
//   (Zotero restores them before the plugin registers the type, crashing startup)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseEnvFile(envPath) {
  const vars = {};
  if (!existsSync(envPath)) return vars;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

function killStaleZotero() {
  try {
    execSync("pkill -9 -f zotero-bin", { stdio: "ignore" });
    console.log("clean-dev-profile: killed stale zotero-bin process");
  } catch {
    // pkill exits 1 when no matching process is found — nothing to clean
  }
}

function cleanSessionTabs(profilePath, addonRef) {
  const sessionPath = path.join(profilePath, "session.json");
  if (!existsSync(sessionPath)) return;

  const session = JSON.parse(readFileSync(sessionPath, "utf8"));
  const prefix = `${addonRef}-`;
  let removed = 0;

  for (const win of session.windows ?? []) {
    const before = win.tabs?.length ?? 0;
    win.tabs = (win.tabs ?? []).filter((tab) => !tab.type?.startsWith(prefix));
    removed += before - win.tabs.length;
    if (removed > 0 && !win.tabs.some((tab) => tab.selected)) {
      const fallback = win.tabs[win.tabs.length - 1];
      if (fallback) fallback.selected = true;
    }
  }

  if (removed > 0) {
    writeFileSync(sessionPath, JSON.stringify(session));
    console.log(
      `clean-dev-profile: removed ${removed} leftover "${prefix}*" tab(s) from session.json`,
    );
  }
}

const pkg = JSON.parse(
  readFileSync(path.join(rootDir, "package.json"), "utf8"),
);
const env = parseEnvFile(path.join(rootDir, ".env"));

killStaleZotero();

if (env.ZOTERO_PLUGIN_PROFILE_PATH) {
  cleanSessionTabs(env.ZOTERO_PLUGIN_PROFILE_PATH, pkg.config.addonRef);
} else {
  console.warn(
    "clean-dev-profile: ZOTERO_PLUGIN_PROFILE_PATH not set in .env, skipping session.json cleanup",
  );
}
