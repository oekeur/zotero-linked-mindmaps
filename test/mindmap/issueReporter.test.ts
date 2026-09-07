import { assert } from "chai";
import {
  buildIssueUrl,
  collectErrorLog,
  URL_BUDGET,
} from "../../src/modules/mindmap/issueReporter";

const PREFIX = "[zoteroLinkedMindmaps]";

function entry(body: string): string {
  return `${PREFIX} ${body}`;
}

describe("issue reporter", function () {
  describe("collectErrorLog", function () {
    it("keeps only this plugin's entries", function () {
      const log = collectErrorLog(
        [
          "some other plugin exploded at /home/someone/secret",
          entry("grouping change failed"),
          "Zotero core warning",
        ],
        URL_BUDGET,
      );

      assert.include(log, "grouping change failed");
      assert.notInclude(log, "some other plugin");
      assert.notInclude(log, "/home/someone/secret");
      assert.notInclude(log, "Zotero core warning");
    });

    it("returns empty when nothing is this plugin's", function () {
      assert.equal(collectErrorLog(["unrelated failure"], URL_BUDGET), "");
    });

    it("returns empty for an empty buffer", function () {
      assert.equal(collectErrorLog([], URL_BUDGET), "");
    });

    it("keeps every entry when they all fit", function () {
      const log = collectErrorLog(
        [entry("first"), entry("second"), entry("third")],
        URL_BUDGET,
      );

      assert.include(log, "first");
      assert.include(log, "second");
      assert.include(log, "third");
      assert.notInclude(log, "older entries dropped");
    });

    it("drops oldest first and marks that it did", function () {
      // Five entries of roughly 2000 encoded characters each overflow a 6000
      // budget, so the oldest go and the newest stay whole. Dropping has to
      // free more than the marker costs, which a two-entry case never does.
      const entries = Array.from({ length: 5 }, (_, i) =>
        entry(`failure ${i} ${"x".repeat(1960)}`),
      );

      const log = collectErrorLog(entries, URL_BUDGET);

      assert.notInclude(log, "failure 0");
      assert.include(log, "failure 4");
      assert.include(log, "older entries dropped");
      assert.isAtMost(encodeURIComponent(log).length, URL_BUDGET);
    });

    it("stays within budget once encoded", function () {
      const entries = Array.from({ length: 40 }, (_, i) =>
        entry(`failure ${i}\n    at frame (file.ts:${i}:1)\n`.repeat(30)),
      );

      const log = collectErrorLog(entries, URL_BUDGET);

      assert.isAtMost(encodeURIComponent(log).length, URL_BUDGET);
      assert.isNotEmpty(log);
    });

    it("cuts a single oversized entry rather than returning nothing", function () {
      const log = collectErrorLog([entry("y".repeat(50000))], URL_BUDGET);

      assert.isNotEmpty(log);
      assert.isAtMost(encodeURIComponent(log).length, URL_BUDGET);
      assert.include(log, "older entries dropped");
    });

    it("budgets the encoded length, not the raw length", function () {
      // Newlines triple under encoding, so a raw-length check would pass a
      // string that the encoded check rejects.
      const log = collectErrorLog([entry("\n".repeat(4000))], 100);
      assert.isAtMost(encodeURIComponent(log).length, 100);
    });

    it("cuts around an astral-plane character rather than throwing", function () {
      // A cut landing between a surrogate pair makes encodeURIComponent throw
      // outright. An item title with an emoji in it reaches this.
      const log = collectErrorLog([entry("💥".repeat(2000))], 200);

      assert.isAtMost(encodeURIComponent(log).length, 200);
    });
  });

  describe("buildIssueUrl", function () {
    const context = {
      pluginVersion: "0.2.0",
      zoteroVersion: "7.0.15",
      os: "Linux",
      errorLog: `${PREFIX} grouping change failed`,
    };

    it("points at the repo's bug form", function () {
      const url = buildIssueUrl("bug", context);
      assert.include(
        url,
        "https://github.com/oekeur/zotero-linked-mindmaps/issues/new?",
      );
      assert.include(url, "template=bug_report.yml");
    });

    it("points at the repo's feature form", function () {
      const url = buildIssueUrl("feature");
      assert.include(url, "template=feature_request.yml");
    });

    it("fills the fields the bug form declares", function () {
      const params = new URL(buildIssueUrl("bug", context)).searchParams;

      assert.equal(params.get("plugin-version"), "0.2.0");
      assert.equal(params.get("zotero-version"), "7.0.15");
      assert.equal(params.get("os"), "Linux");
      assert.include(params.get("debug-output")!, "grouping change failed");
    });

    it("leaves the reporter's own fields empty", function () {
      const params = new URL(buildIssueUrl("bug", context)).searchParams;

      assert.isNull(params.get("what-happened"));
      assert.isNull(params.get("steps"));
      assert.isNull(params.get("area"));
    });

    it("omits debug-output entirely when there is no log", function () {
      const params = new URL(buildIssueUrl("bug", { ...context, errorLog: "" }))
        .searchParams;

      assert.isNull(params.get("debug-output"));
      assert.equal(params.get("zotero-version"), "7.0.15");
    });

    it("sends no diagnostics on the feature form", function () {
      const params = new URL(buildIssueUrl("feature")).searchParams;

      assert.isNull(params.get("debug-output"));
      assert.isNull(params.get("zotero-version"));
      assert.isNull(params.get("os"));
    });

    it("encodes a log containing newlines and quotes", function () {
      const url = buildIssueUrl("bug", {
        ...context,
        errorLog: entry('boom "quoted"\n  at frame (a.ts:1:1)'),
      });

      assert.notInclude(url, "\n");
      assert.notInclude(url, '"');
      assert.include(
        new URL(url).searchParams.get("debug-output")!,
        "at frame (a.ts:1:1)",
      );
    });
  });
});
