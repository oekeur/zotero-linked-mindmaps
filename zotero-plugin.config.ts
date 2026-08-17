import { defineConfig } from "zotero-plugin-scaffold";
import pkg from "./package.json";

// Zotero 9's Browser Toolbox launcher spawns XREExeF (zotero-bin) directly, with
// no -app argument, so the toolbox child boots as generic Firefox, fails on
// resource:///modules/DevToolsStartup.sys.mjs and exits -- taking the parent's
// DevTools server with it. Passing the launcher script as --jsdebugger's
// parameter sets MOZ_BROWSER_TOOLBOX_BINARY, which restores -app. The Zotero 10
// beta patches this in Launcher.sys.mjs (command.replace("zotero-bin",
// "zotero")); 9.0.6 does not. The path form works on both, so this is not
// version-gated. Falls back to the scaffold's bare --jsdebugger when the binary
// path is not in the environment.
const zoteroBinPath = process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH;

export default defineConfig({
  source: ["src", "addon"],
  dist: ".scaffold/build",
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,
  updateURL: `https://github.com/{{owner}}/{{repo}}/releases/download/release/${
    pkg.version.includes("-") ? "update-beta.json" : "update.json"
  }`,
  xpiDownloadLink:
    "https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi",

  build: {
    assets: ["addon/**/*.*"],
    define: {
      ...pkg.config,
      author: pkg.author,
      description: pkg.description,
      homepage: pkg.homepage,
      buildVersion: pkg.version,
      buildTime: "{{buildTime}}",
    },
    prefs: {
      prefix: pkg.config.prefsPrefix,
    },
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        define: {
          __env__: `"${process.env.NODE_ENV}"`,
        },
        bundle: true,
        target: "firefox115",
        outfile: `.scaffold/build/addon/content/scripts/${pkg.config.addonRef}.js`,
      },
    ],
  },

  release: {
    bumpp: {
      // Runs after the version bump and before the commit, with
      // throwOnError, so a broken build aborts the release instead of
      // tagging it. In CI this is also what produces the .xpi and update
      // JSON that the GitHub release step uploads.
      execute: "npm run build",
    },
  },

  server: {
    devtools: !zoteroBinPath,
    startArgs: zoteroBinPath ? ["--jsdebugger", zoteroBinPath] : [],
  },

  test: {
    waitForPlugin: `() => Zotero.${pkg.config.addonInstance}.data.initialized`,
  },

  // If you need to see a more detailed log, uncomment the following line:
  // logLevel: "trace",
});
