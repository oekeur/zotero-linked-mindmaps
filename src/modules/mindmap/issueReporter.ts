/**
 * Opens the project's GitHub issue forms with what the running instance
 * already knows filled in.
 *
 * The bug form carries the plugin's recent failures. Those survive to
 * Zotero.getErrors() whether or not debug logging was ever enabled, which is
 * the whole point of routing failures through logFailure - see
 * docs/internals/logging-explanation.md. Only entries carrying the plugin's own
 * prefix travel: the same buffer holds other plugins' failures and Zotero's
 * own, and those can carry absolute paths naming the user.
 */

import { version as pluginVersion } from "../../../package.json";
import { logFailure } from "../../utils/logging";

const ISSUE_URL = "https://github.com/oekeur/zotero-linked-mindmaps/issues/new";

const BUG_TEMPLATE = "bug_report.yml";
const FEATURE_TEMPLATE = "feature_request.yml";

/** The prefix every logFailure message carries, per the convention in logging.ts. */
const PLUGIN_PREFIX = "[zoteroLinkedMindmaps]";

/**
 * Ceiling for the whole percent-encoded URL. GitHub answers 414 past some
 * undocumented limit; roughly 8KB is the figure in circulation, so this leaves
 * room rather than sitting on the edge. Encoding is what actually bites: every
 * newline in a stack trace becomes three characters.
 */
export const URL_BUDGET = 6000;

const TRUNCATION_MARKER =
  "[older entries dropped to fit the URL; the full log is in Zotero under Help, Report Errors.]";

/**
 * Encoded length, treating an unencodable string as over budget. A slice can
 * land between a surrogate pair, which encodeURIComponent rejects outright
 * rather than replacing; the search above then steps back off it.
 */
function encodedLength(text: string): number {
  try {
    return encodeURIComponent(text).length;
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
 * Keeps only this plugin's entries and drops the oldest until what remains
 * fits `budget` once encoded. Newest entries are kept because they describe
 * the failure the reporter just hit; older ones are usually a previous
 * session's.
 *
 * Takes the array rather than calling Zotero itself so it can be tested
 * without a live instance.
 */
export function collectErrorLog(entries: string[], budget: number): string {
  const mine = entries.filter((entry) => entry.includes(PLUGIN_PREFIX));
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

/** Matches the `os` dropdown's option text in bug_report.yml exactly. */
function currentOS(): string {
  if (Zotero.isWin) return "Windows";
  if (Zotero.isMac) return "macOS";
  if (Zotero.isLinux) return "Linux";
  return "Other";
}

function readErrorLog(): string {
  try {
    return collectErrorLog(Zotero.getErrors(true), URL_BUDGET);
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

export function openBugReport(): void {
  launch(
    buildIssueUrl("bug", {
      pluginVersion,
      zoteroVersion: Zotero.version,
      os: currentOS(),
      errorLog: readErrorLog(),
    }),
  );
}

export function openFeatureRequest(): void {
  launch(buildIssueUrl("feature"));
}
