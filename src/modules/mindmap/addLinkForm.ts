/**
 * "Add link" authoring UI for the Connections panel: a Type select (with a
 * Direction field that only appears for directional types), an optional
 * freeform Name field, and a Save action. Append-only by design - saving
 * only ever pushes a new node/link, never mutates or removes an existing
 * one, so parallel links between the same node pair are unaffected.
 */
import { getLocaleID } from "../../utils/locale";
import { getLinkTypeById, getLinkTypes } from "./linkTypes";
import { readMindmapDocument, writeMindmapDocument } from "./storage";
import { openTargetPicker } from "./targetPicker";
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

export interface CompleteLinkParams {
  sourceRef: ZoteroObjectRef;
  targetRef: ZoteroObjectRef;
  typeId: string;
  name?: string;
  direction?: "forward" | "backward";
}

export type CompleteLinkResult =
  { ok: true; link: MindmapLink } | { ok: false; reason: "self-link" };

/**
 * Resolves `params.targetRef` to a node (creating one if none matches yet,
 * mirroring appendLink's own source-side find-or-create) and appends the
 * link, rejecting a target that's the same object as the source rather than
 * creating a self-referential link.
 */
export function completeLink(
  doc: MindmapDocument,
  params: CompleteLinkParams,
): CompleteLinkResult {
  if (refsMatch(params.sourceRef, params.targetRef)) {
    return { ok: false, reason: "self-link" };
  }

  let targetNode = doc.nodes.find((node) =>
    refsMatch(node.ref, params.targetRef),
  );
  if (!targetNode) {
    targetNode = {
      membership: "member",
      id: Zotero.Utilities.generateObjectKey(),
      position: { x: NaN, y: NaN },
      ref: params.targetRef,
    };
    doc.nodes.push(targetNode);
  }

  const link = appendLink(doc, {
    sourceRef: params.sourceRef,
    targetNodeId: targetNode.id,
    typeId: params.typeId,
    name: params.name,
    direction: params.direction,
  });
  return { ok: true, link };
}

/**
 * Renders the "Add link" form into `container`: Type/Name/Direction fields,
 * a target-item picker, and a Save action that's enabled once a valid
 * target is chosen.
 */
export function renderAddLinkForm(
  container: HTMLElement,
  item: Zotero.Item,
  doc: MindmapDocument,
  onSaved: () => void,
): void {
  const sourceRef: ZoteroObjectRef = {
    kind: item.isNote() ? "note" : "item",
    libraryID: item.libraryID,
    key: item.key,
  };
  let selectedTargetRef: ZoteroObjectRef | null = null;

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

  const targetWrapper = ownerDoc.createElement("div");
  const chooseTargetButton = ownerDoc.createElement("button");
  chooseTargetButton.setAttribute(
    "data-l10n-id",
    getLocaleID("add-link-choose-target-button"),
  );
  targetWrapper.appendChild(chooseTargetButton);

  const targetLabel = ownerDoc.createElement("span");
  targetLabel.style.display = "none";
  targetWrapper.appendChild(targetLabel);

  const targetValidationMessage = ownerDoc.createElement("span");
  targetValidationMessage.style.display = "none";
  targetWrapper.appendChild(targetValidationMessage);

  container.appendChild(targetWrapper);

  const saveButton = ownerDoc.createElement("button");
  saveButton.setAttribute("data-l10n-id", getLocaleID("add-link-save-button"));
  saveButton.disabled = true;
  container.appendChild(saveButton);

  chooseTargetButton.addEventListener("click", () => {
    void (async () => {
      const ref = await openTargetPicker();
      if (!ref) {
        return;
      }

      if (refsMatch(ref, sourceRef)) {
        targetValidationMessage.setAttribute(
          "data-l10n-id",
          getLocaleID("add-link-self-link-error"),
        );
        targetValidationMessage.style.display = "";
        return;
      }

      const targetItem = Zotero.Items.getByLibraryAndKey(
        ref.libraryID,
        ref.key,
      ) as Zotero.Item | false;
      const title = targetItem
        ? targetItem.getField("title") || targetItem.getDisplayTitle()
        : ref.key;

      selectedTargetRef = ref;
      targetLabel.textContent = title;
      targetLabel.style.display = "";
      targetValidationMessage.style.display = "none";
      saveButton.disabled = false;
    })();
  });

  saveButton.addEventListener("click", () => {
    void (async () => {
      if (!selectedTargetRef) {
        return;
      }
      const selectedType = getLinkTypeById(typeSelect.value);
      // Snapshot lengths so a failed write can be rolled back cleanly:
      // completeLink only ever pushes onto the end of doc.nodes/doc.links,
      // never inserts elsewhere, so truncating back to these lengths
      // exactly undoes this attempt.
      const nodesLengthBefore = doc.nodes.length;
      const linksLengthBefore = doc.links.length;

      try {
        const result = completeLink(doc, {
          sourceRef,
          targetRef: selectedTargetRef,
          typeId: typeSelect.value,
          name: nameInput.value.trim() || undefined,
          direction: selectedType?.directional
            ? (directionSelect.value as "forward" | "backward")
            : undefined,
        });
        if (!result.ok) {
          // The picker already blocks selecting a self-referential target,
          // so this only guards against selectedTargetRef changing meaning
          // between pick and save.
          return;
        }

        await writeMindmapDocument(doc);
        onSaved();
      } catch (err) {
        doc.nodes.length = nodesLengthBefore;
        doc.links.length = linksLengthBefore;
        Zotero.debug(
          `[zoteroLinkedMindmaps] failed to save link: ${(err as Error).message}`,
        );
      }
    })();
  });
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
