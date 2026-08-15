/**
 * Main-window "Mindmap" tab shell. Registers a tab-bar entry and a File-menu
 * item to open it, loads the v1 mindmap document from storage, and renders
 * it as a graph that stays in sync with live edits.
 */
import { getString } from "../../utils/locale";
import { findMindmapNote, readMindmapDocument, StorageError } from "./storage";
import { getLinkTypes } from "./linkTypes";
import { attachLiveRefresh, renderMindmap } from "./graphRenderer";
import { layoutUnplacedNodes } from "./layout";
import type { MindmapDocument } from "./schema";

const TAB_TYPE = "zoterolinkedmindmaps-mindmap";
const MENU_ID = "zotero-linked-mindmaps-menuitem-open-mindmap";

let mindmapTabID: string | undefined;
let currentDocument: MindmapDocument | undefined;
let teardownLiveRefresh: (() => void) | undefined;

function renderError(container: HTMLElement, err: StorageError) {
  const el = container.ownerDocument!.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "p",
  ) as unknown as HTMLElement;
  el.textContent = `Failed to load mindmap: ${err.message}`;
  container.appendChild(el as unknown as Node);
}

async function loadMindmapInto(
  container: HTMLElement,
  dockContainer: HTMLElement,
) {
  try {
    currentDocument = await readMindmapDocument();
  } catch (err) {
    if (err instanceof StorageError) {
      renderError(container, err);
      return;
    }
    throw err;
  }

  const linkTypes = getLinkTypes();
  const cy = await renderMindmap(
    container,
    currentDocument,
    linkTypes,
    dockContainer,
  );
  const layoutResult = await layoutUnplacedNodes(cy, currentDocument);
  if (layoutResult) {
    currentDocument = layoutResult;
  }
  const note = await findMindmapNote();
  if (note) {
    teardownLiveRefresh = attachLiveRefresh(
      cy,
      container,
      note.id,
      linkTypes,
      dockContainer,
    );
  }
}

export async function openMindmapTab(): Promise<void> {
  const Zotero_Tabs = ztoolkit.getGlobal("Zotero_Tabs");

  if (mindmapTabID && Zotero_Tabs._tabs.some((t) => t.id === mindmapTabID)) {
    Zotero_Tabs.select(mindmapTabID);
    return;
  }

  const { id, container } = Zotero_Tabs.add({
    type: TAB_TYPE,
    title: getString("mindmap-tab-title"),
    data: {},
    select: true,
    onClose: () => {
      mindmapTabID = undefined;
      teardownLiveRefresh?.();
      teardownLiveRefresh = undefined;
    },
  });
  mindmapTabID = id;

  const doc = container.ownerDocument!;
  const wrapper = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as unknown as HTMLElement;
  wrapper.style.cssText = "display: flex; width: 100%; height: 100%;";
  container.appendChild(wrapper as unknown as Node);

  const div = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as unknown as HTMLElement;
  div.id = "zoterolinkedmindmaps-mindmap-container";
  div.style.cssText = "flex: 1; height: 100%; position: relative;";
  wrapper.appendChild(div as unknown as Node);

  const dockContainer = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as unknown as HTMLElement;
  dockContainer.id = "zoterolinkedmindmaps-mindmap-connections-dock";
  dockContainer.style.cssText =
    "display: none; width: 320px; height: 100%; overflow: auto; border-left: 1px solid; padding: 8px;";
  wrapper.appendChild(dockContainer as unknown as Node);

  await loadMindmapInto(div, dockContainer);
}

export function registerMindmapMenu(): void {
  ztoolkit.Menu.register("menuFile", {
    tag: "menuitem",
    id: MENU_ID,
    label: getString("menuitem-mindmap-open"),
    commandListener: () => {
      void openMindmapTab();
    },
  });
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) {
    return false;
  }
  const tag = el.tagName?.toLowerCase();
  return el.isContentEditable || tag === "input" || tag === "textarea";
}

export function registerMindmapShortcut(): void {
  ztoolkit.Keyboard.register((ev, keyOptions) => {
    if (!keyOptions.keyboard?.equals("shift,g")) {
      return;
    }
    if (isTextEntryTarget(ev.target)) {
      return;
    }
    void openMindmapTab();
  });
}

export function closeMindmapTab(): void {
  if (!mindmapTabID) {
    return;
  }
  ztoolkit.getGlobal("Zotero_Tabs").close(mindmapTabID);
  mindmapTabID = undefined;
}
