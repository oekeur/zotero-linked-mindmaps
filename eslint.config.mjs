// @ts-check Let TS check this config file

import zotero from "@zotero-plugin/eslint-config";
import globals from "globals";

export default zotero({
  overrides: [
    {
      files: ["**/*.ts"],
      rules: {
        // We disable this rule here because the template
        // contains some unused examples and variables
        // TODO(TASK-3): re-enable once src/modules/examples.ts and other
        // template example code are replaced with real plugin code.
        "@typescript-eslint/no-unused-vars": "off",
      },
    },
    {
      // scripts/ runs under plain Node (`node scripts/*.mjs`), unlike
      // src/ and addon/ which target the Zotero sandbox — needs Node globals.
      files: ["scripts/**/*.{js,mjs,cjs}"],
      languageOptions: {
        globals: globals.node,
      },
    },
  ],
});
