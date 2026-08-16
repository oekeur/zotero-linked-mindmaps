/**
 * The read-only summary at the top of the mindmap tab's docked panel: enough
 * of the selected node's item to recognise it without leaving the graph.
 * Deliberately not Zotero's own <item-pane> element - the dock and its
 * Connections content already work, and embedding that element would trade
 * them for an element lifecycle nothing here drives.
 *
 * Field choice mirrors the item tree's own columns (type, first creator,
 * date) rather than the full item pane: this is for telling nodes apart, and
 * the real item is one button away.
 */
import { appendL10nButton } from "./uiElements";
import { buildNoteLabel, MISSING_ITEM_LABEL } from "./nodeLabels";

export const OVERVIEW_CLASS = "mindmap-node-overview";
export const SHOW_IN_LIBRARY_CLASS = "mindmap-show-in-library";
export const CLOSE_CLASS = "mindmap-dock-close";

function appendLine(
  container: HTMLElement,
  doc: Document,
  text: string | undefined,
): void {
  if (!text) {
    return;
  }
  const line = doc.createElement("div");
  line.textContent = text;
  container.appendChild(line);
}

/**
 * Draws the summary for `item` into `container` and returns it, so a caller
 * can put the Connections content underneath.
 *
 * `onShowInLibrary` is wired to a button rather than to the node click that
 * used to do it: switching to the library tab throws away the graph the user
 * was reading, which should be something they ask for.
 *
 * `onClose` hides the dock. It lives here because right-click on a node is
 * the link-creation menu, so closing needs a control of its own rather than
 * a second meaning for that gesture.
 */
export function renderNodeOverview(
  container: HTMLElement,
  item: Zotero.Item,
  onShowInLibrary: () => void,
  onClose?: () => void,
): HTMLElement {
  const doc = container.ownerDocument!;
  const overview = doc.createElement("div");
  overview.classList.add(OVERVIEW_CLASS);

  if (onClose) {
    const close = appendL10nButton(overview, "mindmap-dock-close", onClose);
    close.classList.add(CLOSE_CLASS);
  }

  const title = doc.createElement("div");
  title.textContent = item.isNote()
    ? buildNoteLabel(item)
    : item.getDisplayTitle();
  title.style.fontWeight = "bold";
  overview.appendChild(title);

  if (!item.isNote()) {
    appendLine(
      overview,
      doc,
      Zotero.ItemTypes.getLocalizedString(item.itemTypeID),
    );
    appendLine(overview, doc, item.getField("firstCreator") as string);
    appendLine(overview, doc, item.getField("date") as string);
  }

  const showInLibrary = appendL10nButton(
    overview,
    "mindmap-show-in-library",
    onShowInLibrary,
  );
  showInLibrary.classList.add(SHOW_IN_LIBRARY_CLASS);

  container.appendChild(overview);
  return overview;
}

/**
 * What the dock shows for a node whose item was deleted out from under it.
 * Same wording resolveNodeLabel gives the node on the graph, so the two read
 * as the same thing rather than as two different failures.
 */
export function renderMissingItem(container: HTMLElement): void {
  const doc = container.ownerDocument!;
  const missing = doc.createElement("div");
  missing.classList.add(OVERVIEW_CLASS);
  missing.textContent = MISSING_ITEM_LABEL;
  container.appendChild(missing);
}
