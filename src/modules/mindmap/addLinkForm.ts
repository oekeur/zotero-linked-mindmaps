/**
 * "Add link" authoring UI for the Connections panel: a Type select (with a
 * Direction field that only appears for directional types), an optional
 * freeform Name field, and a Save action. Append-only by design - saving
 * only ever pushes a new node/link, never mutates or removes an existing
 * one, so parallel links between the same node pair are unaffected.
 */
import { getLocaleID } from "../../utils/locale";
import { getLinkTypeById, getLinkTypes } from "./linkTypes";
import {
  listMindmaps,
  readMindmapDocument,
  updateMindmapDocument,
} from "./storage";
import { openTargetPicker } from "./targetPicker";
import {
  canBeMindmapNode,
  createExternalNode,
  createMemberNode,
  refFor,
} from "./mutations";
import { buildNoteLabel, resolveNodeLabel } from "./nodeLabels";
import { appendL10nButton, appendMindmapOptions } from "./uiElements";
import {
  refsMatch,
  type MindmapDocument,
  type MindmapLink,
  type MindmapNode,
  type ZoteroObjectRef,
} from "./schema";

/**
 * Label for the chosen target. A note has no title field, so getDisplayTitle
 * (its first line) stands in. A child note is shown with its parent's title
 * after it: the picker lists child notes as rows of their own, and several of
 * them can read the same way without knowing which item they hang off.
 */
function targetTitle(item: Zotero.Item): string {
  // A note is named the same way it is on the graph and in the node dropdown
  // below - by a preview of its content. Zotero derives a note's title from
  // its first line, which is often absent or unhelpful.
  const title = item.isNote()
    ? buildNoteLabel(item)
    : item.getField("title") || item.getDisplayTitle();
  if (!item.parentItemID) {
    return title;
  }
  const parent = Zotero.Items.get(item.parentItemID);
  return parent ? `${title} (${parent.getDisplayTitle()})` : title;
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
    sourceNode = createMemberNode(params.sourceRef);
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

export interface CompleteExternalLinkParams {
  sourceRef: ZoteroObjectRef;
  targetRef: ZoteroObjectRef;
  homeMindmapId: string;
  homeNodeId: string;
  typeId: string;
  name?: string;
  direction?: "forward" | "backward";
}

/**
 * Links to a node that belongs to another mindmap. The link and the stub
 * standing in for that node both live here, in the mindmap being edited - the
 * other mindmap is not written to at all, which is what makes the one being
 * edited the link's owner.
 *
 * An existing stub for the same (mindmap, node) pair is reused, so linking to
 * the same borrowed node twice doesn't put it on the graph twice.
 */
export function completeExternalLink(
  doc: MindmapDocument,
  params: CompleteExternalLinkParams,
): MindmapLink {
  let targetNode = doc.nodes.find(
    (node) =>
      node.membership === "external" &&
      node.homeMindmapId === params.homeMindmapId &&
      node.homeNodeId === params.homeNodeId,
  );
  if (!targetNode) {
    targetNode = createExternalNode(
      params.targetRef,
      params.homeMindmapId,
      params.homeNodeId,
    );
    doc.nodes.push(targetNode);
  }

  return appendLink(doc, {
    sourceRef: params.sourceRef,
    targetNodeId: targetNode.id,
    typeId: params.typeId,
    name: params.name,
    direction: params.direction,
  });
}

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
    targetNode = createMemberNode(params.targetRef);
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

export const EXTERNAL_TARGET_BUTTON_CLASS = "mindmap-choose-external-target";
export const EXTERNAL_TARGET_CLASS = "mindmap-external-target";

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
  const sourceRef = refFor(item);
  type ChosenTarget =
    | { kind: "local"; ref: ZoteroObjectRef }
    | {
        kind: "external";
        ref: ZoteroObjectRef;
        homeMindmapId: string;
        homeNodeId: string;
      };
  let selectedTarget: ChosenTarget | null = null;

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
  const chooseTargetButton = appendL10nButton(
    targetWrapper,
    "add-link-choose-target-button",
  );

  const chooseExternalButton = appendL10nButton(
    targetWrapper,
    "add-link-choose-external-button",
  );
  chooseExternalButton.classList.add(EXTERNAL_TARGET_BUTTON_CLASS);

  const targetLabel = ownerDoc.createElement("span");
  targetLabel.style.display = "none";
  targetWrapper.appendChild(targetLabel);

  const targetValidationMessage = ownerDoc.createElement("span");
  targetValidationMessage.style.display = "none";
  targetWrapper.appendChild(targetValidationMessage);

  // Where the other-mindmap pickers land once that button is used. Kept empty
  // until then, so the common case of linking within the library never has to
  // read past it.
  const externalWrapper = ownerDoc.createElement("div");
  externalWrapper.classList.add(EXTERNAL_TARGET_CLASS);
  externalWrapper.style.display = "none";
  targetWrapper.appendChild(externalWrapper);

  container.appendChild(targetWrapper);

  const saveButton = appendL10nButton(container, "add-link-save-button");
  saveButton.disabled = true;

  chooseTargetButton.addEventListener("click", () => {
    void (async () => {
      const targetItem = await openTargetPicker();
      if (!targetItem) {
        return;
      }

      // The picker shows attachments alongside items and notes - Zotero's
      // dialog has no filter that separates them - so an ineligible pick is
      // reported here rather than silently ignored.
      if (!canBeMindmapNode(targetItem)) {
        targetValidationMessage.setAttribute(
          "data-l10n-id",
          getLocaleID("add-link-target-not-linkable"),
        );
        targetValidationMessage.style.display = "";
        return;
      }

      const ref = refFor(targetItem);
      if (refsMatch(ref, sourceRef)) {
        targetValidationMessage.setAttribute(
          "data-l10n-id",
          getLocaleID("add-link-self-link-error"),
        );
        targetValidationMessage.style.display = "";
        return;
      }

      selectedTarget = { kind: "local", ref };
      externalWrapper.style.display = "none";
      targetLabel.textContent = targetTitle(targetItem);
      targetLabel.style.display = "";
      targetValidationMessage.style.display = "none";
      saveButton.disabled = false;
    })();
  });

  chooseExternalButton.addEventListener("click", () => {
    void (async () => {
      // Only mindmaps other than the one being edited: a link inside this
      // mindmap is what the item picker above is for, and offering this one
      // here would produce an external stub pointing at its own document.
      const others = (await listMindmaps(item.libraryID)).filter(
        (summary) => summary.id !== doc.id,
      );
      externalWrapper.textContent = "";
      externalWrapper.style.display = "";

      if (others.length === 0) {
        const empty = ownerDoc.createElement("span");
        empty.setAttribute(
          "data-l10n-id",
          getLocaleID("add-link-external-none"),
        );
        externalWrapper.appendChild(empty);
        return;
      }

      const mindmapSelect = ownerDoc.createElement("select");
      appendMindmapOptions(mindmapSelect, others);
      externalWrapper.appendChild(mindmapSelect);

      const nodeSelect = ownerDoc.createElement("select");
      externalWrapper.appendChild(nodeSelect);

      // What the node dropdown is currently offering, kept from the read that
      // built it - picking a node is then a lookup rather than another trip to
      // storage, which is what lets the change handler stay synchronous.
      let offered = new Map<string, MindmapNode>();

      // Only member nodes: a mindmap's own borrowings are not its to lend on.
      async function loadNodes() {
        nodeSelect.textContent = "";
        saveButton.disabled = true;
        const target = await readMindmapDocument(
          mindmapSelect.value,
          item.libraryID,
        );
        offered = new Map(
          target.nodes
            .filter((node) => node.membership === "member")
            .map((node) => [node.id, node]),
        );
        for (const node of offered.values()) {
          const option = ownerDoc.createElement("option");
          option.value = node.id;
          option.textContent = resolveNodeLabel(node.ref);
          nodeSelect.appendChild(option);
        }
        applyExternalSelection();
      }

      function applyExternalSelection() {
        const target = nodeSelect.selectedOptions[0] as
          HTMLOptionElement | undefined;
        const node = target && offered.get(target.value);
        if (!target || !node) {
          selectedTarget = null;
          saveButton.disabled = true;
          targetLabel.style.display = "none";
          return;
        }
        selectedTarget = {
          kind: "external",
          ref: node.ref,
          homeMindmapId: mindmapSelect.value,
          homeNodeId: node.id,
        };
        targetLabel.textContent = `${target.textContent} (${
          mindmapSelect.selectedOptions[0]?.textContent ?? ""
        })`;
        targetLabel.style.display = "";
        targetValidationMessage.style.display = "none";
        saveButton.disabled = false;
      }

      mindmapSelect.addEventListener("change", () => void loadNodes());
      nodeSelect.addEventListener("change", applyExternalSelection);
      await loadNodes();
    })();
  });

  saveButton.addEventListener("click", () => {
    void (async () => {
      if (!selectedTarget) {
        return;
      }
      const target = selectedTarget;
      const selectedType = getLinkTypeById(typeSelect.value);
      const common = {
        sourceRef,
        targetRef: target.ref,
        typeId: typeSelect.value,
        name: nameInput.value.trim() || undefined,
        direction: selectedType?.directional
          ? (directionSelect.value as "forward" | "backward")
          : undefined,
      };

      try {
        // The link is appended to the document as it stands at write time,
        // not to the copy this form was rendered from - the form can sit open
        // while other edits land. A failed write needs no rollback now: the
        // mutation happens on a document the queue discards on throw, and the
        // form's own copy is never touched.
        let completed = false;
        await updateMindmapDocument((current) => {
          if (target.kind === "external") {
            // A borrowed node is a different object from the source by
            // definition, so there is no self-link to guard against.
            completeExternalLink(current, {
              ...common,
              homeMindmapId: target.homeMindmapId,
              homeNodeId: target.homeNodeId,
            });
            completed = true;
            return current;
          }
          const result = completeLink(current, common);
          completed = result.ok;
          // The picker already blocks selecting a self-referential target,
          // so this only guards against the selection changing meaning
          // between pick and save.
          return result.ok ? current : null;
        }, doc.id);
        if (completed) {
          onSaved();
        }
      } catch (err) {
        Zotero.debug(
          `[zoteroLinkedMindmaps] failed to save link: ${(err as Error).message}`,
        );
      }
    })();
  });
}

/**
 * Standalone entry point for opening the "Add link" form outside the item
 * pane (e.g. from a library right-click menu). Resolves once the dialog
 * window closes, so a caller opening one per item in a selection can wait
 * for each to finish before opening the next, rather than racing writes.
 */
export function openAddLinkDialog(
  win: Window,
  item: Zotero.Item,
): Promise<void> {
  void win;
  return new Promise((resolve) => {
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
              const mindmapDoc = await readMindmapDocument(
                undefined,
                item.libraryID,
              );
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
        unloadCallback: () => resolve(),
      })
      .open("Add link", {
        centerscreen: true,
        resizable: true,
        fitContent: true,
      });
  });
}
