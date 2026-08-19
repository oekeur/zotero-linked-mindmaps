import { assert } from "chai";
import { logFailure, logTrace } from "../src/utils/logging";

async function waitForError(marker: string): Promise<string[]> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return (Zotero.getErrors(true) as string[]).filter((e) => e.includes(marker));
}

describe("logging", function () {
  it("logFailure is retrievable via getErrors without debug logging pre-enabled", async function () {
    assert.isFalse(Zotero.Prefs.get("debug.log"), "debug.log should be off");
    assert.isFalse(
      Zotero.Prefs.get("debug.store"),
      "debug.store should be off",
    );

    const marker = `[zoteroLinkedMindmaps] logging test probe ${Date.now()}`;
    logFailure(marker);

    const matches = await waitForError(marker);
    assert.isNotEmpty(matches, `expected getErrors() to contain "${marker}"`);
  });

  it("folds an Error's stack into the message reaching getErrors", async function () {
    const marker = `[zoteroLinkedMindmaps] logging test stack ${Date.now()}`;
    const err = new Error("boom");
    err.stack = `Error: boom\n    at markerFrame${Date.now()} (test.ts:1:1)`;
    logFailure(marker, err);

    const matches = await waitForError(marker);
    assert.isNotEmpty(matches);
    assert.include(matches[0], "markerFrame");
  });

  it("logTrace does not reach getErrors", async function () {
    const marker = `[zoteroLinkedMindmaps] logging test trace ${Date.now()}`;
    logTrace(marker);

    const matches = await waitForError(marker);
    assert.isEmpty(matches);
  });
});
