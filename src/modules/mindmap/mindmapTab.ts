/**
 * Main-window "Mindmap" tab shell. Registers a tab-bar entry and a File-menu
 * item to open it, and renders one mindmap at a time: a toolbar for picking
 * among the library's mindmaps and creating, renaming and deleting them, over
 * a graph that stays in sync with live edits.
 *
 * The per-tab state lives in a controller rather than in module variables, so
 * the toolbar can be driven against a plain set of elements - by a test, or by
 * a second tab - without two of them sharing one selection.
 */
import { getString } from "../../utils/locale";
import {
  createMindmap,
  deleteMindmap,
  findAllMindmapNotes,
  listMindmaps,
  readMindmapDocument,
  resolveMindmap,
  serializeDocument,
  StorageError,
  updateMindmapMetadata,
  type MindmapSummary,
} from "./storage";
import { getLinkTypes } from "./linkTypes";
import { appendMindmapOptions } from "./uiElements";
import {
  attachLiveRefresh,
  renderMindmap,
  type RenderedState,
} from "./graphRenderer";
import { layoutUnplacedNodes } from "./layout";
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

/** The three areas the tab draws into: controls, graph, docked panel. */
export interface TabSurfaces {
  toolbar: HTMLElement;
  graph: HTMLElement;
  dock: HTMLElement;
}

export interface MindmapTabController {
  /** Rebuilds the toolbar from the registry and loads the picked mindmap. */
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
   * Every create, rename and delete comes back through here, so the picker is
   * always a fresh read of the registry rather than a list patched in place.
   */
  async function refresh(): Promise<void> {
    const mindmaps = await listMindmaps();
    const selected =
      mindmaps.find((entry) => entry.id === currentMindmapId) ?? mindmaps[0];

    surfaces.toolbar.textContent = "";
    if (formMode !== "none") {
      renderForm(formMode === "edit" ? selected : undefined);
      return;
    }
    renderToolbar(mindmaps, selected);

    if (!selected) {
      renderEmptyState();
      return;
    }
    if (selected.id !== currentMindmapId || !currentDocument) {
      await load(selected.id);
    }
  }

  function renderToolbar(
    mindmaps: MindmapSummary[],
    selected: MindmapSummary | undefined,
  ): void {
    const doc = surfaces.toolbar.ownerDocument!;

    const label = el(doc, "span");
    label.textContent = `${getString("mindmap-picker-label")} `;
    surfaces.toolbar.appendChild(label as unknown as Node);

    const picker = el(doc, "select");
    picker.id = "zoterolinkedmindmaps-mindmap-picker";
    picker.disabled = mindmaps.length === 0;
    appendMindmapOptions(picker, mindmaps);
    if (selected) {
      picker.value = selected.id;
    }
    picker.addEventListener("change", () => {
      void (async () => {
        await load(picker.value);
        await refresh();
      })();
    });
    surfaces.toolbar.appendChild(picker as unknown as Node);

    const newButton = el(doc, "button");
    newButton.id = "zoterolinkedmindmaps-mindmap-new";
    newButton.textContent = getString("mindmap-new-button");
    newButton.addEventListener("click", () => {
      formMode = "new";
      void refresh();
    });
    surfaces.toolbar.appendChild(newButton as unknown as Node);

    const editButton = el(doc, "button");
    editButton.id = "zoterolinkedmindmaps-mindmap-edit";
    editButton.textContent = getString("mindmap-edit-button");
    editButton.disabled = !selected;
    editButton.addEventListener("click", () => {
      formMode = "edit";
      void refresh();
    });
    surfaces.toolbar.appendChild(editButton as unknown as Node);

    const deleteButton = el(doc, "button");
    deleteButton.id = "zoterolinkedmindmaps-mindmap-delete";
    deleteButton.textContent = getString("mindmap-delete-button");
    deleteButton.disabled = !selected;
    deleteButton.addEventListener("click", () => {
      if (selected) {
        void handleDelete(selected);
      }
    });
    surfaces.toolbar.appendChild(deleteButton as unknown as Node);
  }

  /**
   * Title/description form, used for both creating and renaming. Renders in
   * place of the toolbar rather than in a dialog window, matching the
   * link-types settings pane.
   */
  function renderForm(existing: MindmapSummary | undefined): void {
    const doc = surfaces.toolbar.ownerDocument!;

    const titleField = el(doc, "label");
    titleField.textContent = `${getString("mindmap-form-title-label")} `;
    const titleInput = el(doc, "input");
    titleInput.id = "zoterolinkedmindmaps-mindmap-title-input";
    titleInput.type = "text";
    titleInput.value = existing?.title ?? "";
    titleField.appendChild(titleInput as unknown as Node);
    surfaces.toolbar.appendChild(titleField as unknown as Node);

    const descriptionField = el(doc, "label");
    descriptionField.textContent = `${getString(
      "mindmap-form-description-label",
    )} `;
    const descriptionInput = el(doc, "input");
    descriptionInput.id = "zoterolinkedmindmaps-mindmap-description-input";
    descriptionInput.type = "text";
    descriptionInput.value = existing?.description ?? "";
    descriptionField.appendChild(descriptionInput as unknown as Node);
    surfaces.toolbar.appendChild(descriptionField as unknown as Node);

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
    surfaces.toolbar.appendChild(saveButton as unknown as Node);

    const cancelButton = el(doc, "button");
    cancelButton.id = "zoterolinkedmindmaps-mindmap-cancel";
    cancelButton.textContent = getString("mindmap-form-cancel-button");
    cancelButton.addEventListener("click", () => {
      formMode = "none";
      void refresh();
    });
    surfaces.toolbar.appendChild(cancelButton as unknown as Node);
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
    const win = surfaces.toolbar.ownerDocument!
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
  const wrapper = el(doc, "div");
  wrapper.style.cssText =
    "display: flex; flex-direction: column; width: 100%; height: 100%;";
  container.appendChild(wrapper as unknown as Node);

  const toolbar = el(doc, "div");
  toolbar.id = "zoterolinkedmindmaps-mindmap-toolbar";
  toolbar.style.cssText =
    "display: flex; align-items: center; gap: 6px; padding: 4px 6px;";
  wrapper.appendChild(toolbar as unknown as Node);

  const body = el(doc, "div");
  body.style.cssText = "display: flex; flex: 1; min-height: 0;";
  wrapper.appendChild(body as unknown as Node);

  const graph = el(doc, "div");
  graph.id = "zoterolinkedmindmaps-mindmap-container";
  graph.style.cssText = "flex: 1; height: 100%; position: relative;";
  body.appendChild(graph as unknown as Node);

  const dock = el(doc, "div");
  dock.id = "zoterolinkedmindmaps-mindmap-connections-dock";
  dock.style.cssText =
    "display: none; width: 320px; height: 100%; overflow: auto; border-left: 1px solid; padding: 8px;";
  body.appendChild(dock as unknown as Node);

  controller = createMindmapTabController({ toolbar, graph, dock });
  // A library with no mindmap yet gets one on first open, so the tab lands on
  // a usable graph rather than an empty state nobody asked for.
  if ((await findAllMindmapNotes()).length === 0) {
    await readMindmapDocument();
  }
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
