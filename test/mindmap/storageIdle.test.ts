/* eslint-disable mocha/no-top-level-hooks -- deliberate: this has to apply to
   every suite, and a root hook is the only way mocha offers to do that. */
import { whenStorageIdle } from "../../src/modules/mindmap/storage";

// Root-level hook: applies to every suite, not just this file.
//
// deletionCleanup writes the mindmap document in response to a Zotero item
// delete notification. A test that erases an item it had added as a node
// therefore leaves a storage write in flight that the test itself never
// awaits, and it lands during whatever test runs next - overwriting that
// test's storage note with an older document. Draining the queue at each test
// boundary keeps one test's deletes out of the next test's data.
afterEach(async function () {
  // Zotero delivers the delete notification after eraseTx() has resolved, so
  // at this point the cleanup write is usually not queued yet - yielding first
  // gives the notifier a chance to run and enqueue it, and the drain then
  // waits for it to finish.
  await Zotero.Promise.delay(50);
  await whenStorageIdle();
});
