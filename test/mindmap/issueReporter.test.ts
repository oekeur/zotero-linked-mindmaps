import { assert } from "chai";
import {
  bugReportUrl,
  buildIssueUrl,
  collectErrorLog,
  computeLogBudget,
  MAX_ISSUE_URL_LENGTH,
  stripLocalPaths,
  URL_BUDGET,
} from "../../src/modules/mindmap/issueReporter";
import { logFailure } from "../../src/utils/logging";
import { waitFor } from "../waitFor";

const PREFIX = "[zoteroLinkedMindmaps]";

function entry(body: string): string {
  return `${PREFIX} ${body}`;
}

/**
 * The debug-output field the way buildIssueUrl serialises it. The budget is
 * a bound on this, not on encodeURIComponent's output, which is shorter for
 * `( ) ' ! ~`.
 */
function fieldLength(log: string): number {
  return new URLSearchParams({ "debug-output": log }).toString().length;
}

const XPI_ROOT =
  "jar:file:///home/someone/Zotero/extensions/zoterolinkedmindmaps@oekeur.github.io.xpi!/";
const DEV_ROOT =
  "file:///home/someone/projects/zoteroMindmap/.scaffold/build/addon/";

/** A bare uncaught exception as Zotero's console formats it: no prefix. */
function uncaught(root: string, script = "zoterolinkedmindmaps.js"): string {
  return `[JavaScript Error: "TypeError: node is undefined" {file: "${root}content/scripts/${script}" line: 812}]`;
}

const context = {
  pluginVersion: "0.2.0",
  zoteroVersion: "7.0.15",
  os: "Linux",
  errorLog: `${PREFIX} grouping change failed`,
};

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

    it("admits an unprefixed entry whose file names the plugin's bundle", function () {
      const log = collectErrorLog([uncaught(XPI_ROOT)], URL_BUDGET);

      assert.include(log, "TypeError: node is undefined");
    });

    it("keeps Zotero core and other plugins' script paths out", function () {
      const log = collectErrorLog(
        [
          '[JavaScript Error: "TypeError: x is undefined" {file: "chrome://zotero/content/itemTree.js" line: 40}]',
          uncaught(
            "jar:file:///home/someone/Zotero/extensions/other@example.org.xpi!/",
            "other.js",
          ),
          entry("mine"),
        ],
        URL_BUDGET,
      );

      assert.include(log, "mine");
      assert.notInclude(log, "itemTree.js");
      assert.notInclude(log, "other.js");
    });

    it("admits a differently capitalised prefix", function () {
      const log = collectErrorLog(
        ["[ZoteroLinkedMindmaps] logged before the prefix was settled"],
        URL_BUDGET,
      );

      assert.include(log, "before the prefix was settled");
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
      // Five entries of roughly 2000 encoded characters each overflow the
      // budget, so the oldest go and the newest stay whole. Dropping has to
      // free more than the marker costs, which a two-entry case never does.
      const entries = Array.from({ length: 5 }, (_, i) =>
        entry(`failure ${i} ${"x".repeat(1960)}`),
      );

      const log = collectErrorLog(entries, URL_BUDGET);

      assert.notInclude(log, "failure 0");
      assert.include(log, "failure 4");
      assert.include(log, "older entries dropped");
      assert.isAtMost(fieldLength(log), URL_BUDGET);
    });

    it("stays within budget once encoded", function () {
      const entries = Array.from({ length: 40 }, (_, i) =>
        entry(`failure ${i}\n    at frame (file.ts:${i}:1)\n`.repeat(30)),
      );

      const log = collectErrorLog(entries, URL_BUDGET);

      assert.isAtMost(fieldLength(log), URL_BUDGET);
      assert.isNotEmpty(log);
    });

    it("cuts a single oversized entry rather than returning nothing", function () {
      const log = collectErrorLog([entry("y".repeat(50000))], URL_BUDGET);

      assert.isNotEmpty(log);
      assert.isAtMost(fieldLength(log), URL_BUDGET);
      assert.include(log, "older entries dropped");
    });

    it("budgets the encoded length, not the raw length", function () {
      // Newlines triple under encoding, so a raw-length check would pass a
      // string that the encoded check rejects.
      const log = collectErrorLog([entry("\n".repeat(4000))], 100);
      assert.isAtMost(fieldLength(log), 100);
    });

    it("measures with the encoder the URL uses", function () {
      // encodeURIComponent leaves ( ) bare; URLSearchParams escapes each to
      // three characters. A budget measured with the former passes a log
      // the latter more than doubles.
      const log = collectErrorLog([entry("(x)".repeat(3000))], URL_BUDGET);

      assert.isAtMost(fieldLength(log), URL_BUDGET);
      // The old measure would have let more than twice this much through.
      assert.isBelow(encodeURIComponent(log).length, URL_BUDGET / 2);
    });

    it("cuts around an astral-plane character rather than throwing", function () {
      // A cut landing between a surrogate pair makes the encoder reject the
      // string. An item title with an emoji in it reaches this.
      const log = collectErrorLog([entry("💥".repeat(2000))], 200);

      assert.isAtMost(fieldLength(log), 200);
    });

    it("strips local paths from what it keeps", function () {
      const log = collectErrorLog([uncaught(XPI_ROOT)], URL_BUDGET);

      assert.notInclude(log, "/home/someone");
      assert.include(log, "content/scripts/zoterolinkedmindmaps.js");
    });
  });

  describe("stripLocalPaths", function () {
    it("reduces an installed build's jar path to the plugin-relative one", function () {
      const stripped = stripLocalPaths(uncaught(XPI_ROOT));

      assert.notInclude(stripped, "/home/someone");
      assert.notInclude(stripped, ".xpi");
      assert.include(
        stripped,
        '{file: "content/scripts/zoterolinkedmindmaps.js" line: 812}',
      );
    });

    it("reduces a dev-proxied unpacked path the same way", function () {
      const stripped = stripLocalPaths(uncaught(DEV_ROOT));

      assert.notInclude(stripped, "/home/someone");
      assert.include(
        stripped,
        '{file: "content/scripts/zoterolinkedmindmaps.js" line: 812}',
      );
    });

    it("handles a Windows path", function () {
      const stripped = stripLocalPaths(
        uncaught(
          "jar:file:///C:/Users/Someone/Zotero/extensions/zoterolinkedmindmaps@oekeur.github.io.xpi!/",
        ),
      );

      assert.notInclude(stripped, "Users/Someone");
      assert.include(stripped, '{file: "content/scripts/');
    });

    it("strips every frame of a folded Gecko stack", function () {
      const stack = [
        `${PREFIX} grouping change failed`,
        `applyGrouping@${XPI_ROOT}content/scripts/zoterolinkedmindmaps.js:812:15`,
        `onCommand@${XPI_ROOT}content/scripts/zoterolinkedmindmaps.js:1200:3`,
        "handleEvent@chrome://zotero/content/zoteroPane.js:55:9",
      ].join("\n");

      const stripped = stripLocalPaths(stack);

      assert.notInclude(stripped, "/home/someone");
      assert.include(
        stripped,
        "applyGrouping@content/scripts/zoterolinkedmindmaps.js:812:15",
      );
      assert.include(stripped, "chrome://zotero/content/zoteroPane.js:55:9");
    });

    it("cuts a file URL outside the plugin root to its filename", function () {
      const stripped = stripLocalPaths(
        `hook@jar:file:///home/someone/Zotero/extensions/other@example.org.xpi!/bootstrap.js:10:1\n` +
          `run@file:///home/someone/.local/share/thing/script.js:3:1`,
      );

      assert.notInclude(stripped, "/home/someone");
      assert.include(stripped, "hook@bootstrap.js:10:1");
      assert.include(stripped, "run@script.js:3:1");
    });

    it("leaves an entry without file URLs alone", function () {
      const plain = `${PREFIX} refused a selection spanning two libraries`;
      assert.equal(stripLocalPaths(plain), plain);
    });
  });

  describe("buildIssueUrl", function () {
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

  describe("finished URL length", function () {
    function finishedUrl(
      entries: string[],
      fields = { pluginVersion: "0.2.0", zoteroVersion: "7.0.15", os: "Linux" },
    ): string {
      const budget = computeLogBudget(
        fields.pluginVersion,
        fields.zoteroVersion,
        fields.os,
      );
      return buildIssueUrl("bug", {
        ...fields,
        errorLog: collectErrorLog(entries, budget),
      });
    }

    it("stays under the ceiling for URLSearchParams-expensive characters", function () {
      const url = finishedUrl([entry("(x)".repeat(5000))]);

      assert.isAtMost(url.length, MAX_ISSUE_URL_LENGTH);
      assert.isAbove(url.length, MAX_ISSUE_URL_LENGTH - 100);
    });

    it("stays under the ceiling for a realistic multi-entry Gecko stack", function () {
      const frames = Array.from(
        { length: 25 },
        (_, i) =>
          `fn${i}@${XPI_ROOT}content/scripts/zoterolinkedmindmaps.js:${800 + i}:${i}`,
      ).join("\n");
      const entries = Array.from({ length: 12 }, (_, i) =>
        entry(`failure ${i}: TypeError: node is undefined\n${frames}`),
      );

      const url = finishedUrl(entries);

      assert.isAtMost(url.length, MAX_ISSUE_URL_LENGTH);
      assert.include(url, "failure+11");
    });

    it("derives the log budget from the real fields", function () {
      const short = computeLogBudget("0.2.0", "7.0.15", "Linux");
      const long = computeLogBudget(
        "0.3.0-beta.1",
        "10.0-beta.25+1dbaec65b",
        "Windows",
      );

      assert.isBelow(long, short);
      assert.equal(
        short - long,
        buildIssueUrl("bug", {
          pluginVersion: "0.3.0-beta.1",
          zoteroVersion: "10.0-beta.25+1dbaec65b",
          os: "Windows",
          errorLog: "",
        }).length -
          buildIssueUrl("bug", {
            pluginVersion: "0.2.0",
            zoteroVersion: "7.0.15",
            os: "Linux",
            errorLog: "",
          }).length,
      );
    });

    it("stays under the ceiling for a beta Zotero on Windows with a prerelease plugin", function () {
      const url = finishedUrl([entry("(x)".repeat(5000))], {
        pluginVersion: "0.3.0-beta.1",
        zoteroVersion: "10.0-beta.25+1dbaec65b",
        os: "Windows",
      });

      assert.isAtMost(url.length, MAX_ISSUE_URL_LENGTH);
      assert.include(url, "10.0-beta.25%2B1dbaec65b");
    });
  });

  describe("bugReportUrl against the live error buffer", function () {
    it("carries no local directory from a real getErrors entry", async function () {
      const marker = `${PREFIX} issue reporter path probe ${Date.now()}`;
      // A real Error, so the folded stack carries this test bundle's own
      // file URL, which sits under the checkout and so under the home
      // directory just as an installed build's does.
      logFailure(marker, new Error("probe"));
      await waitFor(
        () =>
          (Zotero.getErrors(true) as string[]).some((e) =>
            e.includes(marker),
          ) || null,
        `a getErrors entry containing "${marker}"`,
      );

      const url = bugReportUrl();
      const log = new URL(url).searchParams.get("debug-output")!;
      const root = String((globalThis as any).rootURI);
      const home = Services.dirsvc.get(
        "Home",
        Components.interfaces.nsIFile,
      ).path;

      assert.include(log, marker);
      assert.notInclude(log, root);
      assert.notInclude(log, home);
      assert.notInclude(log, "file:///");
      assert.isAtMost(url.length, MAX_ISSUE_URL_LENGTH);
    });
  });
});
