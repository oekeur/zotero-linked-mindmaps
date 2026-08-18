/**
 * Main-window "Mindmap" tab shell. Registers a tab-bar entry and a File-menu
 * item to open it, and renders one mindmap at a time: a sidebar listing every
 * mindmap in the library, beside a graph that stays in sync with live edits.
 *
 * Managing mindmaps lives in the sidebar and nowhere else. Creating, renaming
 * and deleting act on the row they sit in rather than on a separate selection,
 * so what a control affects is whatever it is next to.
 *
 * The per-tab state lives in a controller rather than in module variables, so
 * the sidebar can be driven against a plain set of elements - by a test, or by
 * a second tab - without two of them sharing one selection.
 */
import { config } from "../../../package.json";
import { getLocaleID, getString } from "../../utils/locale";
import type { FluentMessageId } from "../../../typings/i10n";
import {
  createMindmap,
  deleteMindmap,
  findAllMindmapNotes,
  hasHiddenMindmapData,
  listMindmaps,
  readMindmapDocument,
  resolveMindmap,
  serializeDocument,
  StorageError,
  updateMindmapMetadata,
  type MindmapSummary,
} from "./storage";
import { warn } from "./containerGuard";
import { getLinkTypes } from "./linkTypes";
import {
  attachLiveRefresh,
  renderMindmap,
  type RenderedState,
} from "./graphRenderer";
import { layoutUnplacedNodes } from "./layout";
import { appendGlyph } from "./uiElements";
import type { MindmapDocument } from "./schema";

const TAB_TYPE = "zoterolinkedmindmaps-mindmap";
const MENU_ID = "zotero-linked-mindmaps-menuitem-open-mindmap";
const HTML_NS = "http://www.w3.org/1999/xhtml";

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
): HTMLElementTagNameMap[K] {
  return doc.createElementNS(
    HTML_NS,
    tag,
  ) as unknown as HTMLElementTagNameMap[K];
}

/** The three areas the tab draws into: mindmap list, graph, docked panel. */
export interface TabSurfaces {
  sidebar: HTMLElement;
  graph: HTMLElement;
  dock: HTMLElement;
}

export const SIDEBAR_ROW_CLASS = "mindmap-sidebar-row";
export const SIDEBAR_ROW_SELECTED_CLASS = "mindmap-sidebar-row-selected";
export const SIDEBAR_ROW_TITLE_CLASS = "mindmap-sidebar-row-title";
export const SIDEBAR_ROW_DESCRIPTION_CLASS = "mindmap-sidebar-row-description";
export const SIDEBAR_ROW_ACTIONS_CLASS = "mindmap-sidebar-row-actions";
export const SIDEBAR_EDIT_CLASS = "mindmap-sidebar-edit";
export const SIDEBAR_DELETE_CLASS = "mindmap-sidebar-delete";
export const SIDEBAR_TOGGLE_ID = "zoterolinkedmindmaps-mindmap-sidebar-toggle";
export const SIDEBAR_HEADER_CLASS = "mindmap-sidebar-header";
export const SIDEBAR_NEW_BUTTON_ID = "zoterolinkedmindmaps-mindmap-new";

const SIDEBAR_WIDTH = "220px";
const SIDEBAR_COLLAPSED_WIDTH = "28px";

const SIDEBAR_COLLAPSED_PREF_KEY = `${config.prefsPrefix}.sidebarCollapsed`;

function readSidebarCollapsed(): boolean {
  return Zotero.Prefs.get(SIDEBAR_COLLAPSED_PREF_KEY, true) === true;
}

function writeSidebarCollapsed(collapsed: boolean): void {
  Zotero.Prefs.set(SIDEBAR_COLLAPSED_PREF_KEY, collapsed, true);
}

export interface MindmapTabController {
  /** Rebuilds the sidebar from the registry and loads the picked mindmap. */
  refresh(): Promise<void>;
  /** Unhooks the live-refresh observer and forgets the loaded mindmap. */
  teardown(): void;
}

type FormMode = "none" | "new" | "edit";

export function createMindmapTabController(
  surfaces: TabSurfaces,
): MindmapTabController {
  let currentDocument: MindmapDocument | undefined;
  let currentMindmapId: string | undefined;
  let teardownLiveRefresh: (() => void) | undefined;
  let formMode: FormMode = "none";
  // Which row's Edit was clicked, rather than whatever is loaded: the two
  // differ as soon as the user edits a mindmap they aren't looking at.
  let formTarget: MindmapSummary | undefined;
  let sidebarCollapsed = readSidebarCollapsed();

  function detachGraph(): void {
    teardownLiveRefresh?.();
    teardownLiveRefresh = undefined;
  }

  /**
   * Loads `mindmapId` (or the library's default mindmap) into the graph area.
   * Tears the previous graph down first, so switching mindmaps doesn't leave a
   * live-refresh observer pointing at a note that is no longer on screen.
   */
  async function load(mindmapId?: string): Promise<void> {
    detachGraph();
    surfaces.graph.textContent = "";
    surfaces.dock.style.display = "none";
    surfaces.dock.textContent = "";

    let note: Zotero.Item;
    try {
      const resolved = await resolveMindmap(mindmapId);
      note = resolved.item;
      currentDocument = resolved.doc;
    } catch (err) {
      if (!(err instanceof StorageError)) {
        throw err;
      }
      currentDocument = undefined;
      const message = el(surfaces.graph.ownerDocument!, "p");
      message.textContent = `Failed to load mindmap: ${err.message}`;
      surfaces.graph.appendChild(message as unknown as Node);
      return;
    }
    currentMindmapId = currentDocument.id;

    const linkTypes = getLinkTypes();
    // One box shared by the graph and its observer, so the observer knows what
    // the graph already shows. Two boxes would mean it never recognises the
    // graph's own writes.
    const rendered: RenderedState = { document: null };
    const cy = await renderMindmap(
      surfaces.graph,
      currentDocument,
      linkTypes,
      surfaces.dock,
      rendered,
    );
    const laidOut = await layoutUnplacedNodes(cy, currentDocument);
    if (laidOut) {
      currentDocument = laidOut;
      // The layout moved the nodes on screen before saving them, so the graph
      // already shows this - recording it keeps the save from flashing.
      rendered.document = serializeDocument(laidOut);
    }
    teardownLiveRefresh = attachLiveRefresh(
      cy,
      surfaces.graph,
      note.id,
      linkTypes,
      surfaces.dock,
      rendered,
    );
  }

  function renderEmptyState(): void {
    detachGraph();
    currentDocument = undefined;
    currentMindmapId = undefined;
    surfaces.graph.textContent = "";
    const message = el(surfaces.graph.ownerDocument!, "p");
    message.id = "zoterolinkedmindmaps-mindmap-empty-state";
    message.textContent = getString("mindmap-empty-state");
    surfaces.graph.appendChild(message as unknown as Node);
  }

  /**
   * Every create, rename and delete comes back through here, so the list is
   * always a fresh read of the registry rather than one patched in place.
   */
  async function refresh(): Promise<void> {
    const mindmaps = await listMindmaps();
    const selected =
      mindmaps.find((entry) => entry.id === currentMindmapId) ?? mindmaps[0];

    surfaces.sidebar.textContent = "";
    surfaces.sidebar.style.width = sidebarCollapsed
      ? SIDEBAR_COLLAPSED_WIDTH
      : SIDEBAR_WIDTH;
    if (formMode !== "none") {
      renderForm(formMode === "edit" ? formTarget : undefined);
      return;
    }
    renderSidebar(mindmaps, selected);

    if (!selected) {
      renderEmptyState();
      return;
    }
    if (selected.id !== currentMindmapId || !currentDocument) {
      await load(selected.id);
    }
  }

  /**
   * Collapsed, the sidebar keeps its toggle and drops everything else, so the
   * graph gets the width back without losing the way to bring the list back.
   * Creation sits beside the heading rather than below the list, the way
   * Zotero's own collections pane puts "New Collection" in its header.
   */
  function renderSidebarHeader(doc: Document): void {
    const header = el(doc, "div");
    header.classList.add(SIDEBAR_HEADER_CLASS);

    if (!sidebarCollapsed) {
      const heading = el(doc, "span");
      heading.textContent = getString("mindmap-sidebar-heading");
      heading.classList.add("mindmap-sidebar-heading");
      header.appendChild(heading as unknown as Node);

      const newButton = el(doc, "button");
      newButton.id = SIDEBAR_NEW_BUTTON_ID;
      newButton.classList.add("mindmap-icon-button");
      newButton.setAttribute(
        "data-l10n-id",
        getLocaleID("mindmap-sidebar-new-button"),
      );
      appendGlyph(newButton, doc, "M8 3v10M3 8h10");
      newButton.addEventListener("click", () => {
        formMode = "new";
        formTarget = undefined;
        void refresh();
      });
      header.appendChild(newButton as unknown as Node);
    }

    const toggle = el(doc, "button");
    toggle.id = SIDEBAR_TOGGLE_ID;
    toggle.textContent = sidebarCollapsed ? "›" : "‹";
    toggle.title = getString(
      sidebarCollapsed ? "mindmap-sidebar-expand" : "mindmap-sidebar-collapse",
    );
    toggle.addEventListener("click", () => {
      sidebarCollapsed = !sidebarCollapsed;
      writeSidebarCollapsed(sidebarCollapsed);
      void refresh();
    });
    header.appendChild(toggle as unknown as Node);

    surfaces.sidebar.appendChild(header as unknown as Node);
  }

  function renderSidebarRow(
    doc: Document,
    mindmap: MindmapSummary,
    isSelected: boolean,
  ): HTMLElement {
    const row = el(doc, "div");
    row.classList.add(SIDEBAR_ROW_CLASS);
    if (isSelected) {
      row.classList.add(SIDEBAR_ROW_SELECTED_CLASS);
    }
    row.setAttribute("data-mindmap-id", mindmap.id);
    row.addEventListener("click", () => {
      void (async () => {
        await load(mindmap.id);
        await refresh();
      })();
    });

    const text = el(doc, "div");
    text.classList.add("mindmap-sidebar-row-text");

    const title = el(doc, "div");
    title.classList.add(SIDEBAR_ROW_TITLE_CLASS);
    title.textContent = mindmap.title;
    text.appendChild(title as unknown as Node);

    if (mindmap.description) {
      const description = el(doc, "div");
      description.classList.add(SIDEBAR_ROW_DESCRIPTION_CLASS);
      description.textContent = mindmap.description;
      text.appendChild(description as unknown as Node);
    }
    row.appendChild(text as unknown as Node);

    const actions = el(doc, "div");
    actions.classList.add(SIDEBAR_ROW_ACTIONS_CLASS);
    appendRowAction(
      doc,
      actions,
      SIDEBAR_EDIT_CLASS,
      "mindmap-edit-button",
      "M10.5 2.5l3 3L6 13l-4 1 1-4z",
      () => {
        formMode = "edit";
        formTarget = mindmap;
        void refresh();
      },
    );
    appendRowAction(
      doc,
      actions,
      SIDEBAR_DELETE_CLASS,
      "mindmap-delete-button",
      "M3.5 5h9M6.5 5V3.2h3V5M4.5 5l0.7 8h5.6l0.7-8",
      () => {
        void handleDelete(mindmap);
      },
    );
    row.appendChild(actions as unknown as Node);

    return row;
  }

  /**
   * A row action stops its click at the button: the row itself loads the
   * mindmap on click, and editing a row should not also switch the graph to
   * it. Hidden until the row is hovered or a control inside it gets focus (see
   * .mindmap-sidebar-row-actions in zoteroPane.css), so the resting list is
   * two rows of content rather than four rows of buttons.
   */
  function appendRowAction(
    doc: Document,
    parent: HTMLElement,
    className: string,
    localeId: FluentMessageId,
    glyphPath: string,
    onClick: () => void,
  ): void {
    const button = el(doc, "button");
    button.classList.add("mindmap-icon-button", className);
    button.setAttribute("data-l10n-id", getLocaleID(localeId));
    appendGlyph(button, doc, glyphPath);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    parent.appendChild(button as unknown as Node);
  }

  function renderSidebar(
    mindmaps: MindmapSummary[],
    selected: MindmapSummary | undefined,
  ): void {
    const doc = surfaces.sidebar.ownerDocument!;
    renderSidebarHeader(doc);
    if (sidebarCollapsed) {
      return;
    }

    for (const mindmap of mindmaps) {
      surfaces.sidebar.appendChild(
        renderSidebarRow(
          doc,
          mindmap,
          selected?.id === mindmap.id,
        ) as unknown as Node,
      );
    }
  }

  /**
   * Title/description form, used for both creating and renaming. Renders in
   * place of the mindmap list rather than in a dialog window, matching the
   * link-types settings pane.
   */
  function renderForm(existing: MindmapSummary | undefined): void {
    const doc = surfaces.sidebar.ownerDocument!;

    const titleField = el(doc, "label");
    titleField.textContent = `${getString("mindmap-form-title-label")} `;
    const titleInput = el(doc, "input");
    titleInput.id = "zoterolinkedmindmaps-mindmap-title-input";
    titleInput.type = "text";
    titleInput.value = existing?.title ?? "";
    titleField.appendChild(titleInput as unknown as Node);
    surfaces.sidebar.appendChild(titleField as unknown as Node);

    const descriptionField = el(doc, "label");
    descriptionField.textContent = `${getString(
      "mindmap-form-description-label",
    )} `;
    const descriptionInput = el(doc, "input");
    descriptionInput.id = "zoterolinkedmindmaps-mindmap-description-input";
    descriptionInput.type = "text";
    descriptionInput.value = existing?.description ?? "";
    descriptionField.appendChild(descriptionInput as unknown as Node);
    surfaces.sidebar.appendChild(descriptionField as unknown as Node);

    const saveButton = el(doc, "button");
    saveButton.id = "zoterolinkedmindmaps-mindmap-save";
    saveButton.textContent = getString("mindmap-form-save-button");
    saveButton.addEventListener("click", () => {
      const title = titleInput.value.trim();
      if (!title) {
        return;
      }
      void handleSave(existing, title, descriptionInput.value.trim());
    });
    surfaces.sidebar.appendChild(saveButton as unknown as Node);

    const cancelButton = el(doc, "button");
    cancelButton.id = "zoterolinkedmindmaps-mindmap-cancel";
    cancelButton.textContent = getString("mindmap-form-cancel-button");
    cancelButton.addEventListener("click", () => {
      formMode = "none";
      void refresh();
    });
    surfaces.sidebar.appendChild(cancelButton as unknown as Node);
  }

  async function handleSave(
    existing: MindmapSummary | undefined,
    title: string,
    description: string,
  ): Promise<void> {
    try {
      if (existing) {
        await updateMindmapMetadata(existing.id, { title, description });
      } else {
        currentMindmapId = (
          await createMindmap(title, description || undefined)
        ).id;
      }
      // The rendered document carries the old metadata, so drop it and let
      // refresh load the saved one.
      currentDocument = undefined;
    } catch (err) {
      Zotero.debug(
        `[zoteroLinkedMindmaps] mindmap save failed: ${(err as Error).message}`,
      );
    }
    formMode = "none";
    await refresh();
  }

  async function handleDelete(target: MindmapSummary): Promise<void> {
    const win = surfaces.sidebar.ownerDocument!
      .defaultView as unknown as mozIDOMWindowProxy | null;
    const confirmed = win
      ? Services.prompt.confirm(
          win,
          getString("mindmap-delete-confirm-title"),
          getString("mindmap-delete-confirm-message", {
            args: { title: target.title },
          }),
        )
      : false;
    if (!confirmed) {
      return;
    }

    try {
      if (target.id === currentMindmapId) {
        // The graph is rendered from the note about to be erased, and its
        // live-refresh observer would fire on the delete.
        detachGraph();
        currentDocument = undefined;
        currentMindmapId = undefined;
      }
      await deleteMindmap(target.id);
    } catch (err) {
      Zotero.debug(
        `[zoteroLinkedMindmaps] mindmap delete failed: ${(err as Error).message}`,
      );
    }
    await refresh();
  }

  return {
    refresh,
    teardown() {
      detachGraph();
      currentDocument = undefined;
      currentMindmapId = undefined;
      formMode = "none";
    },
  };
}

let mindmapTabID: string | undefined;
let controller: MindmapTabController | undefined;

/**
 * Gives a library with no mindmap yet its first one, so the tab lands on a
 * usable graph rather than an empty state nobody asked for.
 *
 * An empty registry has two causes and they need opposite answers. A library
 * that genuinely holds nothing wants a mindmap. A library whose data is in the
 * trash looks identical from the registry's side, and creating there would
 * hand the user a blank mindmap while the one they had sat unreachable - which
 * reads as the plugin having erased their work. So that case is reported and
 * left alone; restoring from the trash is the only thing that fixes it, and
 * that is the user's to do.
 */
async function createDefaultMindmapIfNeeded(): Promise<void> {
  if ((await findAllMindmapNotes()).length > 0) {
    return;
  }
  if (await hasHiddenMindmapData()) {
    warn(getString("mindmap-data-trashed-open"));
    return;
  }
  try {
    await readMindmapDocument();
  } catch (err) {
    // The container can land in the trash between the check above and the
    // write below.
    if (err instanceof StorageError && err.reason === "container-trashed") {
      warn(getString("mindmap-data-trashed-open"));
      return;
    }
    throw err;
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
      controller?.teardown();
      controller = undefined;
    },
  });
  mindmapTabID = id;

  const doc = container.ownerDocument!;
  // One row: sidebar, graph, dock, left to right. The graph is the only one
  // that flexes, so it absorbs whatever width the other two leave.
  const body = el(doc, "div");
  body.style.cssText =
    "display: flex; width: 100%; height: 100%; min-height: 0; overflow: hidden;";
  container.appendChild(body as unknown as Node);

  const sidebar = el(doc, "div");
  sidebar.id = "zoterolinkedmindmaps-mindmap-sidebar";
  // Width is the controller's, since it is what the collapse toggle changes.
  // flex: 0 0 auto keeps that width from being negotiated away.
  sidebar.style.cssText =
    "flex: 0 0 auto; height: 100%; overflow: auto; border-right: 1px solid; padding: 4px; box-sizing: border-box;";
  body.appendChild(sidebar as unknown as Node);

  const graph = el(doc, "div");
  graph.id = "zoterolinkedmindmaps-mindmap-container";
  // min-width: 0 matters: a flex item defaults to min-width: auto, which is
  // its content-based minimum, and Cytoscape's container carries enough of
  // one that the graph refuses to shrink. The row then overflows and pushes
  // the dock off the right edge of the tab, where it renders but cannot be
  // seen or reached.
  graph.style.cssText =
    "flex: 1 1 0; min-width: 0; height: 100%; position: relative;";
  body.appendChild(graph as unknown as Node);

  const dock = el(doc, "div");
  dock.id = "zoterolinkedmindmaps-mindmap-connections-dock";
  dock.style.cssText =
    "display: none; flex: 0 0 320px; height: 100%; overflow: auto; border-left: 1px solid; padding: 8px; box-sizing: border-box;";
  body.appendChild(dock as unknown as Node);

  controller = createMindmapTabController({ sidebar, graph, dock });
  await createDefaultMindmapIfNeeded();
  await controller.refresh();
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
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  const tag = element.tagName?.toLowerCase();
  return element.isContentEditable || tag === "input" || tag === "textarea";
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
