/**
 * Opens the project's GitHub issue forms with what the running instance
 * already knows filled in.
 *
 * The bug form carries the plugin's recent failures. Those survive to
 * Zotero.getErrors() whether or not debug logging was ever enabled, which is
 * the whole point of routing failures through logFailure - see
 * docs/internals/logging-explanation.md. An entry travels when it carries the
 * plugin's own prefix, or - for an uncaught exception logFailure never
 * wrapped - when its `file:` field names the plugin's own bundle script. The
 * same buffer holds other plugins' failures and Zotero's own; those stay out.
 * Every file URL in what does travel is cut down to a path inside the plugin,
 * because the absolute form sits under the profile directory and so names the
 * user's home directory.
 */

import {
  config,
  homepage,
  version as pluginVersion,
} from "../../../package.json";
import { logFailure } from "../../utils/logging";

const ISSUE_URL = `${homepage}/issues/new`;

const BUG_TEMPLATE = "bug_report.yml";
const FEATURE_TEMPLATE = "feature_request.yml";

/** The prefix every logFailure message carries, per the convention in logging.ts. */
const PLUGIN_PREFIX = "[zoteroLinkedMindmaps]";
const PLUGIN_PREFIX_LOWER = PLUGIN_PREFIX.toLowerCase();

/**
 * The bundle's own script filename - see the `outfile` in
 * zotero-plugin.config.ts, which names it from the same `addonRef`. An
 * uncaught exception thrown inside the plugin's code reaches
 * Zotero.getErrors() as a bare `[JavaScript Error: "..." {file:
 * ".../content/scripts/<this>.js" ...}]` with no prefix at all; matching on
 * this is what still catches it.
 */
const BUNDLE_SCRIPT_NAME = `${config.addonRef}.js`.toLowerCase();

/**
 * Ceiling for the whole finished URL. Measured unauthenticated against
 * github.com: a prefilled issue form 302s up to ~6981 characters, answers 500
 * from ~7081, and 414s from ~8300.
 */
export const MAX_ISSUE_URL_LENGTH = 6900;

/**
 * A representative log budget for a caller with no real plugin version,
 * Zotero version or os to build the URL from - test code, mainly. Nothing
 * that launches a report uses it: `openBugReport` measures the budget from
 * the running instance's real values through `computeLogBudget`, because a
 * `10.0-beta.25+1dbaec65b` Zotero version or a prerelease plugin version can
 * push a fixed guess past MAX_ISSUE_URL_LENGTH.
 */
export const URL_BUDGET = 6750;

const TRUNCATION_MARKER =
  "[older entries dropped to fit the URL; the full log is in Zotero under Help, Report Errors.]";

/**
 * A file URL up to and including the plugin's root: the `.xpi!/` of an
 * installed build, or the directory holding `content/` for an unpacked or
 * dev-proxied one. What follows (`content/scripts/<bundle>.js:line`) is what
 * a reader needs.
 */
const EXTENSION_ROOT =
  /(?:jar:)?file:\/\/\/[^\s"'<>]*?(?:\.xpi!\/|\/(?=content\/))/g;

/**
 * Any other file URL, cut to its filename. A stack can pass through another
 * plugin's bundle or a script outside `content/`, and those sit under the
 * profile directory just the same.
 */
const OTHER_FILE_URL = /(?:jar:)?file:\/\/\/[^\s"'<>]*\//g;

/**
 * Reduces every file URL in an error entry to a path relative to the plugin
 * root, or to a bare filename when it points elsewhere. The absolute form
 * sits under the profile directory, which on every platform is under the
 * user's home directory; leaving it in would put the OS username into a
 * public issue.
 */
export function stripLocalPaths(entry: string): string {
  return entry.replace(EXTENSION_ROOT, "").replace(OTHER_FILE_URL, "");
}

/**
 * Encoded length of the `debug-output=<text>` field the way `buildIssueUrl`
 * serialises it: through URLSearchParams, not encodeURIComponent. The two
 * disagree on `( ) ' ! ~`, which URLSearchParams escapes to three characters
 * each and encodeURIComponent leaves bare; a log built of those could pass an
 * encodeURIComponent-measured budget and come out double in the finished
 * URL. An unencodable string (a slice landing between a surrogate pair) is
 * treated as over budget rather than letting the constructor throw; the
 * search below then steps back off it.
 */
function encodedLength(text: string): number {
  try {
    return new URLSearchParams({ "debug-output": text }).toString().length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * The longest `prefix + body.slice(0, n)` that fits `budget` once encoded, or
 * null when the prefix alone already does not.
 */
function cutToFit(prefix: string, body: string, budget: number): string | null {
  if (encodedLength(prefix) > budget) {
    return null;
  }
  let low = 0;
  let high = body.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (encodedLength(prefix + body.slice(0, mid)) <= budget) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return prefix + body.slice(0, low);
}

export type IssueContext = {
  pluginVersion: string;
  zoteroVersion: string;
  os: string;
  errorLog: string;
};

/**
 * Keeps only this plugin's entries, strips their local paths, and drops the
 * oldest until what remains fits `budget` once encoded as the debug-output
 * field. Newest entries are kept because they describe the failure the
 * reporter just hit; older ones are usually a previous session's.
 *
 * An entry qualifies by carrying the prefix (case-insensitive, so an entry
 * logged under a differently capitalised prefix still travels) or by naming
 * the plugin's own bundle script in its `file:` field.
 *
 * Takes the array rather than calling Zotero itself so it can be tested
 * without a live instance.
 */
export function collectErrorLog(entries: string[], budget: number): string {
  const mine = entries
    .filter((entry) => {
      const lower = entry.toLowerCase();
      return (
        lower.includes(PLUGIN_PREFIX_LOWER) ||
        lower.includes(BUNDLE_SCRIPT_NAME)
      );
    })
    .map(stripLocalPaths);
  if (mine.length === 0) {
    return "";
  }

  // Drop from the front (oldest) until the encoded result fits.
  for (let start = 0; start < mine.length; start++) {
    const kept = mine.slice(start);
    const body =
      start === 0
        ? kept.join("\n\n")
        : `${TRUNCATION_MARKER}\n\n${kept.join("\n\n")}`;
    if (encodedLength(body) <= budget) {
      return body;
    }
  }

  // Even the newest entry alone overflows, so cut it mid-string. Slicing the
  // raw text and re-encoding keeps the result valid; slicing encoded text
  // could sever a percent-escape.
  const newest = mine[mine.length - 1];
  const marked = cutToFit(`${TRUNCATION_MARKER}\n\n`, newest, budget);
  if (marked !== null) {
    return marked;
  }

  // The marker itself does not fit. Send whatever of the entry does rather
  // than blowing the budget to explain that we could not.
  return cutToFit("", newest, budget) ?? "";
}

/**
 * Builds a prefill URL for one of the two issue forms. Field names are the
 * `id` values in .github/ISSUE_TEMPLATE/*.yml, which is what GitHub matches
 * query parameters against.
 *
 * `blank_issues_enabled` is false for this repo, so the template parameter is
 * required rather than cosmetic.
 */
export function buildIssueUrl(
  kind: "bug" | "feature",
  context?: IssueContext,
): string {
  const params = new URLSearchParams();
  params.set("template", kind === "bug" ? BUG_TEMPLATE : FEATURE_TEMPLATE);

  if (kind === "bug" && context) {
    params.set("plugin-version", context.pluginVersion);
    params.set("zotero-version", context.zoteroVersion);
    params.set("os", context.os);
    // An empty prefill would read as "there was nothing here", which is a
    // different claim from "the plugin logged nothing". Omit it instead.
    if (context.errorLog) {
      params.set("debug-output", context.errorLog);
    }
  }

  return `${ISSUE_URL}?${params.toString()}`;
}

/**
 * The ceiling for the `debug-output=<value>` field, measured from the URL
 * these three values build with no log at all rather than from a fixed guess
 * at their combined length.
 *
 * The empty-log URL omits the debug-output param entirely (see buildIssueUrl),
 * so only the `&` joining it is added back here: `encodedLength` already
 * counts the key and `=` in what it measures.
 */
export function computeLogBudget(
  pluginVersion: string,
  zoteroVersion: string,
  os: string,
): number {
  const shellUrl = buildIssueUrl("bug", {
    pluginVersion,
    zoteroVersion,
    os,
    errorLog: "",
  });
  return MAX_ISSUE_URL_LENGTH - shellUrl.length - 1;
}

/** Matches the `os` dropdown's option text in bug_report.yml exactly. */
function currentOS(): string {
  if (Zotero.isWin) return "Windows";
  if (Zotero.isMac) return "macOS";
  if (Zotero.isLinux) return "Linux";
  return "Other";
}

function readErrorLog(
  pluginVersion: string,
  zoteroVersion: string,
  os: string,
): string {
  try {
    const budget = computeLogBudget(pluginVersion, zoteroVersion, os);
    return collectErrorLog(Zotero.getErrors(true), budget);
  } catch (err) {
    // A report without the log still beats no report at all.
    logFailure(
      `${PLUGIN_PREFIX} could not read the error log for a bug report`,
      err,
    );
    return "";
  }
}

function launch(url: string): void {
  try {
    Zotero.launchURL(url);
  } catch (err) {
    // launchURL throws on an unhandled scheme rather than returning false.
    logFailure(`${PLUGIN_PREFIX} could not open the issue form`, err);
  }
}

/** The bug form URL for the running instance, log included. */
export function bugReportUrl(): string {
  const zoteroVersion = Zotero.version;
  const os = currentOS();
  return buildIssueUrl("bug", {
    pluginVersion,
    zoteroVersion,
    os,
    errorLog: readErrorLog(pluginVersion, zoteroVersion, os),
  });
}

export function openBugReport(): void {
  launch(bugReportUrl());
}

export function openFeatureRequest(): void {
  launch(buildIssueUrl("feature"));
}
