import { assert } from "chai";
import { config } from "../../package.json";
import { getString, LOCALE_FILES } from "../../src/utils/locale";
import type { FluentMessageId } from "../../typings/i10n";

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

/**
 * A message plus the attribute getString has to ask for to reach its text.
 * A few messages carry no value of their own, only `.label`/`.tooltiptext`,
 * and getString falls back to the raw id for those unless given the branch -
 * so asking for the value alone would report them as unresolved.
 */
interface Message {
  id: string;
  hasValue: boolean;
  branch?: string;
}

function messages(source: string): Message[] {
  const parsed: Message[] = [];
  for (const line of source.split("\n")) {
    const head = /^([a-z0-9-]+)\s*=(.*)$/i.exec(line);
    if (head) {
      parsed.push({ id: head[1], hasValue: head[2].trim() !== "" });
      continue;
    }
    // Indented lines starting with a dot are attributes; other indented
    // lines continue a multi-line value and are not of interest here.
    const attribute = /^\s+\.([a-z0-9-]+)\s*=/i.exec(line);
    const last = parsed[parsed.length - 1];
    if (attribute && last && !last.branch) {
      last.branch = attribute[1];
    }
  }
  return parsed;
}

/**
 * The scaffold prefixes the message ids inside each built .ftl with the
 * addonRef, and getString prepends that same prefix itself - so the id has to
 * go back to its source-tree form before being asked for.
 */
function resolve(message: Message): string {
  const id = message.id.replace(
    new RegExp(`^${config.addonRef}-`),
    "",
  ) as FluentMessageId;
  return !message.hasValue && message.branch
    ? getString(id, message.branch)
    : getString(id);
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
    // getString reads the plugin singleton through the bare `addon` global,
    // which the plugin sets on its own scope at startup. The test bundle is a
    // separate scope, so point its `addon` at the running instance.
    (globalThis as any).addon = (Zotero as any)[config.addonInstance];
  });

  it("registers every shipped .ftl file with getString's bundle", function () {
    assert.deepEqual(
      FILES.filter((file) => !LOCALE_FILES.includes(file)),
      [],
      "shipped .ftl files that initLocale does not load, whose keys getString renders as raw ids",
    );
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

    it(`getString resolves every message id in ${file}.ftl`, async function () {
      this.timeout(30000);
      const parsed = messages(await localeSource("en-US", file));
      assert.isNotEmpty(parsed);
      const unresolved = parsed
        .filter((message) => resolve(message) === message.id)
        .map((message) => message.id);
      assert.deepEqual(
        unresolved,
        [],
        `keys getString renders as raw ids; check that "${file}" is in LOCALE_FILES`,
      );
    });
  }

  /**
   * The same bundle, asked for in Dutch. getString formats in whatever locale
   * the profile is set to, so this builds a Localization pinned to nl-NL
   * instead of switching the profile and restarting.
   */
  it("resolves the same keys under nl-NL", function () {
    const bundle = new (Localization as any)(
      LOCALE_FILES.map((name) => `${config.addonRef}-${name}.ftl`),
      true,
      undefined,
      ["nl-NL"],
    );
    const ids = [
      "mindmap-sidebar-heading",
      "mindmap-new-button",
      "mindmap-empty-state",
      "mindmap-show-in-library",
      "mindmap-delete-confirm-title",
    ].map((id) => `${config.addonRef}-${id}`);

    const formatted = bundle.formatMessagesSync(ids.map((id) => ({ id })));
    const missing = ids.filter((id, index) => !formatted[index]?.value);
    assert.deepEqual(missing, [], "keys with no Dutch text");
    // The control that this really is the Dutch bundle and not en-US again.
    assert.equal(
      bundle.formatValueSync(`${config.addonRef}-mindmap-new-button`),
      "Nieuw",
    );
  });

  // It was template scaffolding with two of forty-odd strings translated, and
  // nobody here can verify Chinese. A zh-CN profile now falls back to en-US,
  // which is what it was effectively doing anyway.
  it("ships no zh-CN locale", async function () {
    this.timeout(30000);
    // A missing file:// URL reads as empty here rather than throwing, so the
    // check is on content, with en-US as the control that a present locale
    // reads as non-empty.
    let content: string;
    try {
      content = await localeSource("zh-CN", "addon");
    } catch {
      content = "";
    }
    assert.equal(content.trim(), "", "zh-CN is still in the built add-on");
    assert.isNotEmpty((await localeSource("en-US", "addon")).trim());
  });
});
