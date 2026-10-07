/* eslint-disable mocha/no-top-level-hooks -- root hooks are the point: they wrap every spec file in the page */
import { assert } from "chai";
import { config } from "../package.json";
import { AreaGuardImpl } from "./areaGuard";

/**
 * Installs the graph-area mutation guard for the whole spec bundle. Mocha
 * runs every spec file in one page, so these root-level hooks wrap all of
 * them. The guard lives on the plugin instance because each spec file is its
 * own esbuild bundle with its own copy of graphArea.ts, and the plugin's own
 * copy (the real tab) reads it from the same place.
 */
const guard = new AreaGuardImpl();

function instance(): { areaGuard?: unknown } {
  return (Zotero as any)[config.addonInstance];
}

before(function () {
  instance().areaGuard = guard;
});

afterEach(function () {
  assert.deepEqual(
    guard.settle(),
    [],
    "a graph container or dock was written outside the graph area",
  );
});

after(function () {
  delete instance().areaGuard;
});
