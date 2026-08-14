// @ts-check Let TS check this config file

import zotero from "@zotero-plugin/eslint-config";

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
  ],
});
