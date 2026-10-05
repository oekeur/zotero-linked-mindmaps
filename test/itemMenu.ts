import { config } from "../package.json";
import { query, queryAll } from "./dom";

/** The data-l10n-id Zotero.MenuManager gives the entry for `id`. */
export function menuL10nID(id: string): string {
  return `${config.addonRef}-${id}`;
}

export type OpenMenu = {
  popup: Element;
  /** The popup's direct child labelled `id`, or null. */
  entry(id: string): Element | null;
  /** The plugin's own entries in DOM order. */
  pluginEntries(): Element[];
  close(): void;
};

/**
 * Opens a menu the way Zotero does, short of showing it on screen: Zotero
 * attaches each plugin entry's onShowing as a one-shot popupshowing listener
 * when it builds the popup, and the command and onHidden listeners come off
 * on popuphidden. Each opening has to be closed again, or the next one stacks
 * a second command listener on the same element and one command runs the
 * action twice.
 */
function openPopup(win: any, popup: Element): OpenMenu {
  popup.dispatchEvent(new win.Event("popupshowing"));
  return {
    popup,
    entry: (id) =>
      popup.querySelector(`:scope > [data-l10n-id="${menuL10nID(id)}"]`),
    pluginEntries: () =>
      queryAll(popup, `:scope > [data-l10n-id^="${menuL10nID("menu-")}"]`),
    close: () => popup.dispatchEvent(new win.Event("popuphidden")),
  };
}

/** The library item menu, built for the items currently selected. */
export async function openItemMenu(win: any): Promise<OpenMenu> {
  await win.ZoteroPane.buildItemContextMenu();
  return openPopup(
    win,
    query(win.document, "#zotero-itemmenu", "the library item menu"),
  );
}

/** The Tools menu; Zotero fills in plugin entries on its popupshowing. */
export function openToolsMenu(win: any): OpenMenu {
  return openPopup(
    win,
    query(win.document, "#menu_ToolsPopup", "the Tools menu popup"),
  );
}

export function isShown(element: Element | null): boolean {
  return !!element && !(element as XULElement).hidden;
}
