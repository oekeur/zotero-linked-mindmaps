import { assert } from "chai";
import { config } from "../../package.json";
import {
  DEFAULT_LINK_TYPES,
  getLinkTypes,
  localizedDefaultLinkTypes,
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
    assert.deepEqual(getLinkTypes(), localizedDefaultLinkTypes());
    assert.isEmpty(logErrorCalls);
  });

  it("logs and falls back to defaults when the pref won't parse as JSON", function () {
    Zotero.Prefs.set(PREF_KEY, "not json{", true);
    assert.deepEqual(getLinkTypes(), localizedDefaultLinkTypes());
    assert.lengthOf(logErrorCalls, 1);
    assert.include(logErrorCalls[0].message, "would not parse");
  });

  it("logs and falls back to defaults when the pref has an unexpected shape", function () {
    Zotero.Prefs.set(PREF_KEY, JSON.stringify([{ foo: 1 }]), true);
    assert.deepEqual(getLinkTypes(), localizedDefaultLinkTypes());
    assert.lengthOf(logErrorCalls, 1);
    assert.include(logErrorCalls[0].message, "unexpected shape");
  });

  it("returns the stored types without logging when they're well-formed", function () {
    setLinkTypes(DEFAULT_LINK_TYPES);
    assert.deepEqual(getLinkTypes(), DEFAULT_LINK_TYPES);
    assert.isEmpty(logErrorCalls);
  });

  describe("default labels follow the locale", function () {
    const DUTCH: Record<string, string> = {
      "link-type-default-cites": "citeert",
      "link-type-default-supports": "ondersteunt",
      "link-type-default-contradicts": "weerspreekt",
      "link-type-default-primary-source-for": "primaire bron voor",
      "link-type-default-related-to": "verwant aan",
    };

    it("labels the defaults from a supplied resolver, ids and direction unchanged", function () {
      const types = localizedDefaultLinkTypes((message) => DUTCH[message]);

      assert.deepEqual(
        types.map((type) => type.id),
        DEFAULT_LINK_TYPES.map((type) => type.id),
      );
      assert.deepEqual(
        types.map((type) => type.directional),
        DEFAULT_LINK_TYPES.map((type) => type.directional),
      );
      assert.deepEqual(
        types.map((type) => type.label),
        Object.values(DUTCH),
      );
    });

    it("falls back to the English label for a message the resolver cannot answer", function () {
      const types = localizedDefaultLinkTypes(() => undefined);
      assert.deepEqual(types, DEFAULT_LINK_TYPES);
    });

    it("resolves Dutch labels from the shipped nl-NL bundle without a relaunch", function () {
      // A Localization built for one locale rather than the app's, over the
      // same .ftl the plugin registers, so the labels a Dutch profile would
      // read are asserted here under an English test run.
      const { Localization } = Zotero.getMainWindow() as any;
      const dutch = new Localization(
        [`${config.addonRef}-addon.ftl`],
        true,
        undefined,
        ["nl-NL"],
      );
      const label = (message: string): string | undefined =>
        dutch.formatValueSync(`${config.addonRef}-${message}`) ?? undefined;

      const types = localizedDefaultLinkTypes(label);

      assert.deepEqual(
        types.map((type) => type.label),
        Object.values(DUTCH),
      );
    });

    it("resolves through the plugin's own bundle under the running locale", function () {
      // The default resolver reads the plugin singleton through the bare
      // `addon` global, which only the plugin's scope sets; point this
      // bundle's at the running instance for the duration of the spec.
      const previous = (globalThis as any).addon;
      (globalThis as any).addon = (Zotero as any)[config.addonInstance];
      try {
        assert.isDefined(
          (globalThis as any).addon.data.locale,
          "without the bundle the resolver falls back to English and proves nothing",
        );
        const labels = localizedDefaultLinkTypes().map((type) => type.label);
        assert.deepEqual(
          labels,
          DEFAULT_LINK_TYPES.map((type) => type.label),
          "the test run is en-US, so the bundle's labels are the English ones",
        );
        for (const label of labels) {
          assert.notInclude(label, config.addonRef);
        }
      } finally {
        (globalThis as any).addon = previous;
      }
    });

    it("leaves a persisted vocabulary alone whatever the locale resolves to", function () {
      // Once written, labels are the user's data; a Dutch resolver has no say.
      const stored: LinkType[] = [
        { id: "cites", label: "citation", directional: true },
      ];
      setLinkTypes(stored);
      assert.deepEqual(getLinkTypes(), stored);
    });
  });
});
