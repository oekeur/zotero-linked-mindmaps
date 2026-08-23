import { assert } from "chai";
import { logFailure, logTrace } from "../src/utils/logging";
import { waitFor } from "./waitFor";

function errorsMatching(marker: string): string[] {
  return (Zotero.getErrors(true) as string[]).filter((e) => e.includes(marker));
}

/** Resolves with the matching entries once the log reaches getErrors. */
function waitForError(marker: string): Promise<string[]> {
  return waitFor(() => {
    const matches = errorsMatching(marker);
    return matches.length > 0 ? matches : null;
  }, `a getErrors entry containing "${marker}"`);
}

/**
 * The counterpart for a log that must never arrive. There is no condition to
 * poll for an absence, so this stays a flat wait: long enough that an entry
 * on its way would have landed.
 */
async function waitForNoError(marker: string): Promise<string[]> {
  await Zotero.Promise.delay(200);
  return errorsMatching(marker);
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

    const matches = await waitForNoError(marker);
    assert.isEmpty(matches);
  });
});
