/**
 * "Add link" authoring UI for the Connections panel: a Type select (with a
 * Direction field that only appears for directional types), an optional
 * freeform Name field, and a Save action. Adding a link is append-only -
 * saving only ever pushes a new node/link, never mutates or removes an
 * existing one, so parallel links between the same node pair are unaffected.
 *
 * The same form doubles as the "Edit link" UI: given an existing link, it
 * prefills Type/Name/Direction from it, fixes the endpoints (they are not
 * editable), and Save mutates that link in place instead of appending a new
 * one - see `renderAddLinkForm`'s `editing` parameter.
 */
import { getLocaleID } from "../../utils/locale";
import { logFailure } from "../../utils/logging";
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
  updateLink,
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
 *
 * Rejects a borrowed node that stands for the same Zotero object as the source.
 * The stub and the source node are distinct nodes, so nothing here would break
 * - but the other mindmap can hold a member node for the very item being
 * edited, and taking it would draw one item as two nodes joined by a link.
 */
export function completeExternalLink(
  doc: MindmapDocument,
  params: CompleteExternalLinkParams,
): CompleteLinkResult {
  if (refsMatch(params.sourceRef, params.targetRef)) {
    return { ok: false, reason: "self-link" };
  }

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

export const SAVE_BUTTON_CLASS = "mindmap-form-save";
export const CANCEL_BUTTON_CLASS = "mindmap-form-cancel";

export const EXTERNAL_TARGET_BUTTON_CLASS = "mindmap-choose-external-target";
export const EXTERNAL_TARGET_CLASS = "mindmap-external-target";

/**
 * What to prefill and mutate when the form is opened on an existing link
 * rather than to create one. `otherTitle` is the fixed endpoint's label,
 * already resolved by the caller - the form has no way to derive it on its
 * own once the target picker is hidden.
 */
export interface EditLinkParams {
  link: MindmapLink;
  otherTitle: string;
}

/**
 * Renders the "Add link" form into `container`: Type/Name/Direction fields,
 * a target-item picker, and a Save action that's enabled once a valid
 * target is chosen.
 *
 * `onCancel`, when given, adds a Cancel button ahead of Save in the footer.
 * The item pane and docked mounts leave it out - dismissing the form there
 * just means collapsing it again, not closing a window.
 *
 * `editing`, when given, switches the form to edit an existing link:
 * Type/Name/Direction are prefilled from it, the target picker and the
 * "Link to another mindmap…" action are hidden since the endpoints aren't
 * editable, and Save mutates that link in place instead of appending one.
 */
export function renderAddLinkForm(
  container: HTMLElement,
  item: Zotero.Item,
  doc: MindmapDocument,
  onSaved: () => void,
  onCancel?: () => void,
  editing?: EditLinkParams,
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

  const grid = ownerDoc.createElement("div");
  grid.classList.add("mindmap-form-grid");
  container.appendChild(grid);

  const typeLabel = ownerDoc.createElement("label");
  typeLabel.setAttribute("data-l10n-id", getLocaleID("add-link-type-label"));
  grid.appendChild(typeLabel);

  const typeSelect = ownerDoc.createElement("select");
  for (const type of getLinkTypes()) {
    const option = ownerDoc.createElement("option");
    option.value = type.id;
    option.textContent = type.label;
    typeSelect.appendChild(option);
  }
  grid.appendChild(typeSelect);

  const nameLabel = ownerDoc.createElement("label");
  nameLabel.setAttribute("data-l10n-id", getLocaleID("add-link-name-label"));
  grid.appendChild(nameLabel);

  const nameInput = ownerDoc.createElement("input");
  nameInput.type = "text";
  grid.appendChild(nameInput);

  if (editing) {
    typeSelect.value = editing.link.typeId;
    nameInput.value = editing.link.name ?? "";
  }

  // display:contents in the sheet, so the label and the select sit in the
  // grid's own two columns rather than as one cell - and hiding the wrapper
  // still hides both.
  const directionWrapper = ownerDoc.createElement("div");
  directionWrapper.classList.add("mindmap-form-direction");
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
  grid.appendChild(directionWrapper);

  // Both options name the two ends of the relation and use the selected type
  // as the verb ("This item cites the target"), so the argument is rewritten
  // whenever the type changes and Fluent re-resolves the two labels. The
  // argument goes through data-l10n-args rather than a getString call, which
  // would reach for the addon global during render.
  function updateDirectionField() {
    const selectedType = getLinkTypeById(typeSelect.value);
    directionWrapper.style.display = selectedType?.directional ? "" : "none";
    const args = JSON.stringify({ type: selectedType?.label ?? "" });
    forwardOption.setAttribute("data-l10n-args", args);
    backwardOption.setAttribute("data-l10n-args", args);
  }
  typeSelect.addEventListener("change", updateDirectionField);
  updateDirectionField();
  if (editing?.link.direction) {
    directionSelect.value = editing.link.direction;
  }

  const targetFieldLabel = ownerDoc.createElement("label");
  targetFieldLabel.setAttribute(
    "data-l10n-id",
    getLocaleID("add-link-target-label"),
  );
  grid.appendChild(targetFieldLabel);

  const targetWrapper = ownerDoc.createElement("div");
  targetWrapper.classList.add("mindmap-form-target");
  grid.appendChild(targetWrapper);

  // Shows what was picked rather than leaving the choice invisible behind a
  // button. Its own placeholder until then, swapped by id so Fluent is never
  // fighting a textContent write.
  const targetLabel = ownerDoc.createElement("span");
  targetLabel.classList.add("mindmap-form-target-value");
  targetLabel.setAttribute(
    "data-l10n-id",
    getLocaleID("add-link-target-empty"),
  );
  targetWrapper.appendChild(targetLabel);

  const chooseTargetButton = appendL10nButton(
    targetWrapper,
    "add-link-choose-target-button",
  );

  const targetValidationMessage = ownerDoc.createElement("span");
  targetValidationMessage.style.display = "none";
  container.appendChild(targetValidationMessage);

  const actions = ownerDoc.createElement("div");
  actions.classList.add("mindmap-form-actions");
  container.appendChild(actions);

  // The rarer case, so it reads as an action rather than competing with the
  // picker above for the same weight.
  const chooseExternalButton = appendL10nButton(
    actions,
    "add-link-choose-external-button",
  );
  chooseExternalButton.classList.add(
    EXTERNAL_TARGET_BUTTON_CLASS,
    "mindmap-link-external",
  );

  // The endpoints of an existing link aren't editable, so the picker and the
  // cross-mindmap action have nothing to do here - the fixed target is shown
  // as plain text instead.
  if (editing) {
    targetLabel.removeAttribute("data-l10n-id");
    targetLabel.textContent = editing.otherTitle;
    chooseTargetButton.style.display = "none";
    chooseExternalButton.style.display = "none";
  }

  const spacer = ownerDoc.createElement("span");
  spacer.classList.add("mindmap-form-spacer");
  actions.appendChild(spacer);

  // Where the other-mindmap pickers land once that button is used. Kept empty
  // until then, so the common case of linking within the library never has to
  // read past it.
  const externalWrapper = ownerDoc.createElement("div");
  externalWrapper.classList.add(EXTERNAL_TARGET_CLASS);
  externalWrapper.style.display = "none";
  container.appendChild(externalWrapper);

  if (onCancel) {
    const cancelButton = appendL10nButton(
      actions,
      "mindmap-form-cancel-button",
      onCancel,
    );
    cancelButton.classList.add(CANCEL_BUTTON_CLASS);
  }

  const saveButton = appendL10nButton(actions, "add-link-save-button");
  // A stable hook for the save action. Its Fluent id is not one: the disabled
  // state swaps the id to carry a tooltip, so anything keyed on the id would
  // be keyed on the button's copy.
  saveButton.classList.add(SAVE_BUTTON_CLASS);

  /**
   * A disabled Save that says what it is still waiting for. The two states are
   * separate messages rather than a title written at render time, because
   * reaching for getString here would reach for the addon global with it.
   */
  function setSaveEnabled(enabled: boolean): void {
    saveButton.disabled = !enabled;
    saveButton.setAttribute(
      "data-l10n-id",
      getLocaleID(
        enabled ? "add-link-save-button" : "add-link-save-button-disabled",
      ),
    );
  }
  // Editing has nothing left to wait for: the target is already fixed, so
  // Save starts enabled rather than waiting on a picker that isn't shown.
  setSaveEnabled(Boolean(editing));

  chooseTargetButton.addEventListener("click", () => {
    void (async () => {
      const targetItem = await openTargetPicker(item.libraryID);
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
      targetLabel.removeAttribute("data-l10n-id");
      targetLabel.textContent = targetTitle(targetItem);
      targetValidationMessage.style.display = "none";
      setSaveEnabled(true);
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
      // The source item is left out too - another mindmap can hold a node for
      // the item being edited, and borrowing it would draw that one item as
      // two nodes with a link between them.
      async function loadNodes() {
        nodeSelect.textContent = "";
        setSaveEnabled(false);
        const target = await readMindmapDocument(
          mindmapSelect.value,
          item.libraryID,
        );
        offered = new Map(
          target.nodes
            .filter(
              (node) =>
                node.membership === "member" && !refsMatch(node.ref, sourceRef),
            )
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
          setSaveEnabled(false);
          targetLabel.textContent = "";
          targetLabel.setAttribute(
            "data-l10n-id",
            getLocaleID("add-link-target-empty"),
          );
          return;
        }
        selectedTarget = {
          kind: "external",
          ref: node.ref,
          homeMindmapId: mindmapSelect.value,
          homeNodeId: node.id,
        };
        targetLabel.removeAttribute("data-l10n-id");
        targetLabel.textContent = `${target.textContent} (${
          mindmapSelect.selectedOptions[0]?.textContent ?? ""
        })`;
        targetValidationMessage.style.display = "none";
        setSaveEnabled(true);
      }

      mindmapSelect.addEventListener("change", () => void loadNodes());
      nodeSelect.addEventListener("change", applyExternalSelection);
      await loadNodes();
    })();
  });

  saveButton.addEventListener("click", () => {
    void (async () => {
      const selectedType = getLinkTypeById(typeSelect.value);
      const fields = {
        typeId: typeSelect.value,
        name: nameInput.value.trim() || undefined,
        direction: selectedType?.directional
          ? (directionSelect.value as "forward" | "backward")
          : undefined,
      };

      if (editing) {
        try {
          await updateMindmapDocument(
            (current) => {
              updateLink(current, editing.link.id, fields);
              return current;
            },
            doc.id,
            item.libraryID,
          );
          onSaved();
        } catch (err) {
          logFailure(
            `[zoteroLinkedMindmaps] failed to save link: ${(err as Error).message}`,
            err,
          );
        }
        return;
      }

      if (!selectedTarget) {
        return;
      }
      const target = selectedTarget;
      const common = { sourceRef, targetRef: target.ref, ...fields };

      try {
        // The link is appended to the document as it stands at write time,
        // not to the copy this form was rendered from - the form can sit open
        // while other edits land. A failed write needs no rollback now: the
        // mutation happens on a document the queue discards on throw, and the
        // form's own copy is never touched.
        //
        // The library is threaded through with the id: without it the write
        // resolves doc.id against the user library, so a link authored in a
        // group library never finds its own mindmap and the save does nothing
        // - silently, since the throw is swallowed below.
        let completed = false;
        await updateMindmapDocument(
          (current) => {
            const result =
              target.kind === "external"
                ? completeExternalLink(current, {
                    ...common,
                    homeMindmapId: target.homeMindmapId,
                    homeNodeId: target.homeNodeId,
                  })
                : completeLink(current, common);
            completed = result.ok;
            // Both pickers already keep a self-referential target from being
            // chosen, so this only guards against the selection changing
            // meaning between pick and save.
            return result.ok ? current : null;
          },
          doc.id,
          item.libraryID,
        );
        if (completed) {
          onSaved();
        }
      } catch (err) {
        logFailure(
          `[zoteroLinkedMindmaps] failed to save link: ${(err as Error).message}`,
          err,
        );
      }
    })();
  });
}

export const ADD_LINK_DIALOG_CONTENT_ID =
  "zoterolinkedmindmaps-add-link-dialog-content";

const ADD_LINK_DIALOG_URL =
  "chrome://zoterolinkedmindmaps/content/addLink.xhtml";

/**
 * Grows `win` if the form has ended up taller than the height the window
 * opened at. The window's own height covers the form as it normally stands;
 * this is for the cases that outgrow it, the "choose from another mindmap"
 * pickers in particular.
 *
 * Only ever grows. A XUL window applies its intrinsic sizing after load, and
 * that pass discards a resize made before it - shrinking a window that is
 * merely roomy is not worth losing that race over.
 *
 * The wait matters as much as the measurement: the form is built after the
 * window has sized itself, and Fluent fills its labels in later still, so
 * measuring any earlier reads a form that has not finished growing.
 */
async function fitDialogToContent(
  win: Window,
  content: HTMLElement,
): Promise<void> {
  const doc = win.document as Document & { l10n?: { ready: Promise<void> } };
  await doc.l10n?.ready;
  await new Promise<void>((resolve) =>
    win.requestAnimationFrame(() => resolve()),
  );

  const rect = content.getBoundingClientRect();
  // The gap above the form is left below it too, so the form does not end up
  // flush against the bottom edge.
  const needed = Math.ceil(rect.bottom + rect.top);
  if (rect.height > 0 && needed > win.innerHeight) {
    win.resizeBy(0, needed - win.innerHeight);
  }
}

export const DIALOG_CONTEXT_CLASS = "mindmap-dialog-context";

/**
 * A line naming the item being linked and the mindmap it is being linked in,
 * shown above the form in the standalone window only - the item pane and
 * docked mounts already carry that context on screen (the panel is already
 * on the item, and shows which mindmap it belongs to), so repeating it there
 * would be redundant.
 */
function renderDialogContext(
  container: HTMLElement,
  item: Zotero.Item,
  mindmapTitle: string,
): void {
  const context = container.ownerDocument!.createElement("div");
  context.classList.add(DIALOG_CONTEXT_CLASS);
  context.setAttribute("data-l10n-id", getLocaleID("add-link-dialog-context"));
  context.setAttribute(
    "data-l10n-args",
    JSON.stringify({ item: targetTitle(item), mindmap: mindmapTitle }),
  );
  container.appendChild(context);
}

/**
 * Standalone entry point for opening the "Add link" form outside the item
 * pane (e.g. from a library right-click menu). Resolves once the dialog
 * window closes, so a caller opening one per item in a selection can wait
 * for each to finish before opening the next, rather than racing writes.
 *
 * The window is the plugin's own chrome document rather than the blank one a
 * ztoolkit.Dialog opens. That blank window costs more than it saves: it
 * carries no Fluent strings, so the form renders every label and button empty;
 * it sizes itself on a timer the form's own async render outlasts; and an HTML
 * select's dropdown does not open in it at all. A chrome document registers
 * its own .ftl declaratively and puts the form in the same kind of document
 * the item pane already renders it into. It still has to be fitted around the
 * form afterwards, which fitDialogToContent does.
 *
 * `mindmapId` is the mindmap the link belongs in. Left out, the library's
 * default one is used and created on demand - which is right for a library
 * that has no mindmap yet, and wrong for one that has several, so callers with
 * a user's answer in hand should pass it.
 */
export function openAddLinkDialog(
  win: Window,
  item: Zotero.Item,
  mindmapId?: string,
): Promise<void> {
  return new Promise((resolve) => {
    const dialog = (win as any).openDialog(
      ADD_LINK_DIALOG_URL,
      "",
      "chrome,centerscreen,resizable,dialog=no",
    ) as Window;

    dialog.addEventListener(
      "load",
      () => {
        // Resolving on the window's own unload, rather than on a close() the
        // form knows about, covers the user closing it from the titlebar too.
        dialog.addEventListener("unload", () => resolve(), { once: true });
        void (async () => {
          const contentEl = dialog.document.getElementById(
            ADD_LINK_DIALOG_CONTENT_ID,
          ) as HTMLElement;
          try {
            const mindmapDoc = await readMindmapDocument(
              mindmapId,
              item.libraryID,
            );
            contentEl.textContent = "";
            renderDialogContext(contentEl, item, mindmapDoc.title);
            const formContainer = dialog.document.createElement("div");
            contentEl.appendChild(formContainer);
            renderAddLinkForm(
              formContainer,
              item,
              mindmapDoc,
              () => {
                dialog.close();
              },
              () => {
                dialog.close();
              },
            );
          } catch (err) {
            contentEl.textContent = `Failed to load mindmap: ${
              (err as Error).message
            }`;
          }
          await fitDialogToContent(dialog, contentEl);
        })();
      },
      { once: true },
    );
  });
}
