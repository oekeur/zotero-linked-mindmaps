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
  // add-on from its URL without asking.
  it("registers no toolkit zotero:// handlers", function () {
    const extensions = (
      Services.io.getProtocolHandler("zotero") as unknown as {
        wrappedJSObject: { _extensions: Record<string, unknown> };
      }
    ).wrappedJSObject._extensions;
    assert.notProperty(extensions, "zotero://plugin");
    assert.notProperty(extensions, "zotero://ztoolkit-debug");
  });
});
