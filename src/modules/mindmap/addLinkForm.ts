/**
 * "Add link" authoring UI for the Connections panel: a Type select (with a
 * Direction field that only appears for directional types), an optional
 * freeform Name field, and a Save action. Append-only by design - saving
 * only ever pushes a new node/link, never mutates or removes an existing
 * one, so parallel links between the same node pair are unaffected.
 */
import { getLocaleID } from "../../utils/locale";
import { getLinkTypeById, getLinkTypes } from "./linkTypes";
import { readMindmapDocument } from "./storage";
import type { MindmapDocument, MindmapLink, ZoteroObjectRef } from "./schema";

function refsMatch(a: ZoteroObjectRef, b: ZoteroObjectRef): boolean {
  return a.kind === b.kind && a.libraryID === b.libraryID && a.key === b.key;
}

export interface AddLinkParams {
  sourceRef: ZoteroObjectRef;
  targetNodeId: string;
  typeId: string;
  name?: string;
  direction?: "forward" | "backward";
}

/**
 * Appends a new link to `doc`, creating a source node for `params.sourceRef`
 * first if one doesn't already exist. Only pushes onto doc.nodes/doc.links -
 * never mutates or removes an existing node or link.
 */
export function appendLink(
  doc: MindmapDocument,
  params: AddLinkParams,
): MindmapLink {
  let sourceNode = doc.nodes.find((node) =>
    refsMatch(node.ref, params.sourceRef),
  );
  if (!sourceNode) {
    sourceNode = {
      membership: "member",
      id: Zotero.Utilities.generateObjectKey(),
      // No layout pass has placed this node yet. schema.ts's Position
      // requires numbers, so NaN stands in as an "unplaced" marker until a
      // real layout assigns coordinates.
      position: { x: NaN, y: NaN },
      ref: params.sourceRef,
    };
    doc.nodes.push(sourceNode);
  }

  const link: MindmapLink = {
    id: Zotero.Utilities.generateObjectKey(),
    typeId: params.typeId,
    name: params.name,
    sourceNodeId: sourceNode.id,
    targetNodeId: params.targetNodeId,
  };
  if (params.direction) {
    link.direction = params.direction;
  }
  doc.links.push(link);
  return link;
}

/**
 * Renders the "Add link" form into `container`: Type/Name/Direction fields
 * plus a disabled Save button (see below). `item`, `doc`, and `onSaved`
 * aren't used by this task's fields yet - they're part of the contract a
 * target-item picker will need once it wires up the Save button.
 */
export function renderAddLinkForm(
  container: HTMLElement,
  item: Zotero.Item,
  doc: MindmapDocument,
  onSaved: () => void,
): void {
  void item;
  void doc;
  void onSaved;

  const ownerDoc = container.ownerDocument!;
  container.textContent = "";

  const typeLabel = ownerDoc.createElement("label");
  typeLabel.setAttribute("data-l10n-id", getLocaleID("add-link-type-label"));
  container.appendChild(typeLabel);

  const typeSelect = ownerDoc.createElement("select");
  for (const type of getLinkTypes()) {
    const option = ownerDoc.createElement("option");
    option.value = type.id;
    option.textContent = type.label;
    typeSelect.appendChild(option);
  }
  container.appendChild(typeSelect);

  const nameLabel = ownerDoc.createElement("label");
  nameLabel.setAttribute("data-l10n-id", getLocaleID("add-link-name-label"));
  container.appendChild(nameLabel);

  const nameInput = ownerDoc.createElement("input");
  nameInput.type = "text";
  container.appendChild(nameInput);

  const directionWrapper = ownerDoc.createElement("div");
  const directionLabel = ownerDoc.createElement("label");
  directionLabel.setAttribute(
    "data-l10n-id",
    getLocaleID("add-link-direction-label"),
  );
  directionWrapper.appendChild(directionLabel);

  const directionSelect = ownerDoc.createElement("select");
  const forwardOption = ownerDoc.createElement("option");
  forwardOption.value = "forward";
  forwardOption.setAttribute(
    "data-l10n-id",
    getLocaleID("add-link-direction-forward"),
  );
  const backwardOption = ownerDoc.createElement("option");
  backwardOption.value = "backward";
  backwardOption.setAttribute(
    "data-l10n-id",
    getLocaleID("add-link-direction-backward"),
  );
  directionSelect.appendChild(forwardOption);
  directionSelect.appendChild(backwardOption);
  directionWrapper.appendChild(directionSelect);
  container.appendChild(directionWrapper);

  function updateDirectionVisibility() {
    const selectedType = getLinkTypeById(typeSelect.value);
    directionWrapper.style.display = selectedType?.directional ? "" : "none";
  }
  typeSelect.addEventListener("change", updateDirectionVisibility);
  updateDirectionVisibility();

  const targetPlaceholder = ownerDoc.createElement("div");
  // Target selection isn't wired in yet - this stays a static placeholder
  // until a real target-item picker sets targetNodeId above.
  targetPlaceholder.setAttribute(
    "data-l10n-id",
    getLocaleID("add-link-target-placeholder"),
  );
  container.appendChild(targetPlaceholder);

  const saveButton = ownerDoc.createElement("button");
  saveButton.setAttribute("data-l10n-id", getLocaleID("add-link-save-button"));
  // No target-item picker is wired in yet, so there's no targetNodeId to
  // complete a link with. Whatever adds one calls appendLink() (above),
  // persists via writeMindmapDocument(), calls onSaved(), then enables this
  // button.
  saveButton.disabled = true;
  container.appendChild(saveButton);
}

/**
 * Standalone entry point for opening the "Add link" form outside the item
 * pane (e.g. from a library right-click menu), reserved for a future
 * caller - not exercised by the Connections panel itself.
 */
export function openAddLinkDialog(win: Window, item: Zotero.Item): void {
  const dialog = new ztoolkit.Dialog(1, 1)
    .addCell(0, 0, {
      tag: "div",
      namespace: "html",
      id: "zoterolinkedmindmaps-add-link-dialog-content",
      styles: { width: "100%" },
    })
    .setDialogData({
      loadCallback: () => {
        void (async () => {
          const contentEl = dialog.window.document.getElementById(
            "zoterolinkedmindmaps-add-link-dialog-content",
          ) as HTMLElement;
          try {
            const mindmapDoc = await readMindmapDocument(item.libraryID);
            renderAddLinkForm(contentEl, item, mindmapDoc, () => {
              dialog.window.close();
            });
          } catch (err) {
            contentEl.textContent = `Failed to load mindmap: ${
              (err as Error).message
            }`;
          }
        })();
      },
    })
    .open("Add link", {
      centerscreen: true,
      resizable: true,
      fitContent: true,
    });
  void win;
}
