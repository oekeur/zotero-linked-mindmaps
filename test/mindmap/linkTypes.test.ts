import { assert } from "chai";
import { config } from "../../package.json";
import {
  DEFAULT_LINK_TYPES,
  getLinkTypes,
  setLinkTypes,
  type LinkType,
} from "../../src/modules/mindmap/linkTypes";

const PREF_KEY = `${config.prefsPrefix}.linkTypes`;

describe("mindmap/linkTypes", function () {
  let originalTypes: LinkType[];
  let originalLogError: typeof Zotero.logError;
  let logErrorCalls: Error[];

  before(function () {
    originalTypes = getLinkTypes();
  });

  beforeEach(function () {
    logErrorCalls = [];
    originalLogError = Zotero.logError;
    Zotero.logError = (err: Error) => {
      logErrorCalls.push(err);
    };
  });

  afterEach(function () {
    Zotero.logError = originalLogError;
    setLinkTypes(originalTypes);
  });

  it("falls back to defaults silently when the pref was never set", function () {
    Zotero.Prefs.clear(PREF_KEY, true);
    assert.deepEqual(getLinkTypes(), DEFAULT_LINK_TYPES);
    assert.isEmpty(logErrorCalls);
  });

  it("logs and falls back to defaults when the pref won't parse as JSON", function () {
    Zotero.Prefs.set(PREF_KEY, "not json{", true);
    assert.deepEqual(getLinkTypes(), DEFAULT_LINK_TYPES);
    assert.lengthOf(logErrorCalls, 1);
    assert.include(logErrorCalls[0].message, "would not parse");
  });

  it("logs and falls back to defaults when the pref has an unexpected shape", function () {
    Zotero.Prefs.set(PREF_KEY, JSON.stringify([{ foo: 1 }]), true);
    assert.deepEqual(getLinkTypes(), DEFAULT_LINK_TYPES);
    assert.lengthOf(logErrorCalls, 1);
    assert.include(logErrorCalls[0].message, "unexpected shape");
  });

  it("returns the stored types without logging when they're well-formed", function () {
    setLinkTypes(DEFAULT_LINK_TYPES);
    assert.deepEqual(getLinkTypes(), DEFAULT_LINK_TYPES);
    assert.isEmpty(logErrorCalls);
  });
});
