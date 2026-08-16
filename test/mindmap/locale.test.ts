import { assert } from "chai";
import { config } from "../../package.json";

/**
 * Compares message ids, not translations. A key added to en-US and forgotten
 * in nl-NL renders as a raw id in the UI, which is the failure this catches
 * and the one nothing else would.
 *
 * The scaffold rewrites each .ftl to <addonRef>-<name>.ftl per locale
 * directory at build time, so these are read from the installed add-on rather
 * than from the source tree.
 */
const FILES = ["addon", "mainWindow"];

async function localeSource(locale: string, file: string): Promise<string> {
  const url = `${(globalThis as any).rootURI}locale/${locale}/zoterolinkedmindmaps-${file}.ftl`;
  return Zotero.File.getContentsFromURLAsync(url);
}

function messageIds(source: string): string[] {
  return source
    .split("\n")
    .map((line) => /^([a-z0-9-]+)\s*=/i.exec(line)?.[1])
    .filter(Boolean) as string[];
}

describe("locales", function () {
  before(async function () {
    this.timeout(30000);
    // rootURI is a global in the plugin's own scope; the test bundle is a
    // separate one, so the installed add-on's own root is asked for directly.
    const { AddonManager } = ChromeUtils.importESModule(
      "resource://gre/modules/AddonManager.sys.mjs",
    ) as any;
    const installed = await AddonManager.getAddonByID(config.addonID);
    (globalThis as any).rootURI = installed
      .getResourceURI()
      .spec.replace(/\/?$/, "/");
  });

  for (const file of FILES) {
    it(`nl-NL carries every message id en-US has in ${file}.ftl`, async function () {
      this.timeout(30000);
      let english: string[];
      let dutch: string[];
      try {
        english = messageIds(await localeSource("en-US", file));
        dutch = messageIds(await localeSource("nl-NL", file));
      } catch (err) {
        assert.fail(
          `could not read locale files: ${(err as Error)?.message} (rootURI=${(globalThis as any).rootURI})`,
        );
        return;
      }

      assert.isNotEmpty(english);
      assert.deepEqual(
        english.filter((id) => !dutch.includes(id)),
        [],
        "message ids missing from nl-NL",
      );
      assert.deepEqual(
        dutch.filter((id) => !english.includes(id)),
        [],
        "message ids in nl-NL that en-US no longer has",
      );
    });
  }

  // It was template scaffolding with two of forty-odd strings translated, and
  // nobody here can verify Chinese. A zh-CN profile now falls back to en-US,
  // which is what it was effectively doing anyway.
  it("ships no zh-CN locale", async function () {
    this.timeout(30000);
    // A missing file:// URL reads as empty here rather than throwing, so the
    // check is on content, with en-US as the control that a present locale
    // reads as non-empty.
    let content = "";
    try {
      content = await localeSource("zh-CN", "addon");
    } catch {
      content = "";
    }
    assert.equal(content.trim(), "", "zh-CN is still in the built add-on");
    assert.isNotEmpty((await localeSource("en-US", "addon")).trim());
  });
});
