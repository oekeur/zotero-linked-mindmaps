import { assert } from "chai";
import { config } from "../package.json";

describe("startup", function () {
  it("should have plugin instance defined", function () {
    assert.isNotEmpty(
      (Zotero as unknown as Record<string, unknown>)[config.addonInstance],
    );
  });

  // zotero-plugin-toolkit 5 registered both handlers on startup, Zotero-wide.
  // Any web page can open a zotero:// link, and zotero://plugin installed an
  // add-on from its URL without asking. Newer Zotero defines both keys itself
  // as getters returning undefined, so check the value, not the key.
  it("registers no toolkit zotero:// handlers", function () {
    const extensions = (
      Services.io.getProtocolHandler("zotero") as unknown as {
        wrappedJSObject: { _extensions: Record<string, unknown> };
      }
    ).wrappedJSObject._extensions;
    assert.isUndefined(extensions["zotero://plugin"]);
    assert.isUndefined(extensions["zotero://ztoolkit-debug"]);
  });
});
