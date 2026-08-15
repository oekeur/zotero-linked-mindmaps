/**
 * Preferences-pane UI for the link-type vocabulary: lets a user list, add,
 * edit, and delete types on top of linkTypes.ts's Zotero.Prefs-backed
 * storage. Renders with direct DOM creation into a container the pane's
 * XHTML fragment hands over on load - no separate dialog window.
 */
import { getString } from "../../utils/locale";
import { readMindmapDocument } from "./storage";
import { getLinkTypes, setLinkTypes, type LinkType } from "./linkTypes";

const HTML_NS = "http://www.w3.org/1999/xhtml";

type Mode = { kind: "list" } | { kind: "add" } | { kind: "edit"; id: string };

let mode: Mode = { kind: "list" };
let selectedTypeId: string | null = null;

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
): HTMLElementTagNameMap[K] {
  return doc.createElementNS(
    HTML_NS,
    tag,
  ) as unknown as HTMLElementTagNameMap[K];
}

/**
 * Renders (or re-renders) the link-types settings UI into `container`. Safe
 * to call repeatedly - each call clears and rebuilds from current storage
 * and module state, which is how every state transition below redraws.
 */
export function renderLinkTypesSettings(container: HTMLElement): void {
  const doc = container.ownerDocument!;
  container.textContent = "";

  const heading = el(doc, "h2");
  heading.textContent = getString("preferences-heading");
  container.appendChild(heading);

  if (mode.kind !== "list") {
    renderForm(container, mode.kind === "edit" ? mode.id : null);
    return;
  }

  renderToolbar(container);
  renderTable(container);
}

function renderToolbar(container: HTMLElement): void {
  const doc = container.ownerDocument!;
  const types = getLinkTypes();
  const hasSelection =
    selectedTypeId !== null && types.some((type) => type.id === selectedTypeId);

  const toolbar = el(doc, "div");
  container.appendChild(toolbar);

  const addButton = el(doc, "button");
  addButton.textContent = getString("preferences-add-button");
  addButton.addEventListener("click", () => {
    mode = { kind: "add" };
    renderLinkTypesSettings(container);
  });
  toolbar.appendChild(addButton);

  const editButton = el(doc, "button");
  editButton.textContent = getString("preferences-edit-button");
  editButton.disabled = !hasSelection;
  editButton.addEventListener("click", () => {
    if (!selectedTypeId) return;
    mode = { kind: "edit", id: selectedTypeId };
    renderLinkTypesSettings(container);
  });
  toolbar.appendChild(editButton);

  const deleteButton = el(doc, "button");
  deleteButton.textContent = getString("preferences-delete-button");
  deleteButton.disabled = !hasSelection;
  deleteButton.addEventListener("click", () => {
    if (!selectedTypeId) return;
    void handleDelete(container, selectedTypeId);
  });
  toolbar.appendChild(deleteButton);
}

function renderTable(container: HTMLElement): void {
  const doc = container.ownerDocument!;
  const table = el(doc, "table");
  container.appendChild(table);

  const headRow = el(doc, "tr");
  const labelHead = el(doc, "th");
  labelHead.textContent = getString("preferences-column-label");
  const directionalHead = el(doc, "th");
  directionalHead.textContent = getString("preferences-column-directional");
  headRow.append(labelHead, directionalHead);
  const head = el(doc, "thead");
  head.appendChild(headRow);
  table.appendChild(head);

  const body = el(doc, "tbody");
  table.appendChild(body);

  for (const type of getLinkTypes()) {
    const row = el(doc, "tr");
    row.style.cursor = "pointer";
    if (type.id === selectedTypeId) {
      row.style.fontWeight = "bold";
    }
    row.addEventListener("click", () => {
      selectedTypeId = type.id;
      renderLinkTypesSettings(container);
    });

    const labelCell = el(doc, "td");
    labelCell.textContent = type.label;
    const directionalCell = el(doc, "td");
    directionalCell.textContent = getString(
      type.directional
        ? "preferences-directional-yes"
        : "preferences-directional-no",
    );
    row.append(labelCell, directionalCell);
    body.appendChild(row);
  }
}

function renderForm(container: HTMLElement, editId: string | null): void {
  const doc = container.ownerDocument!;
  const existing = editId
    ? getLinkTypes().find((type) => type.id === editId)
    : undefined;

  const form = el(doc, "div");
  container.appendChild(form);

  const labelField = el(doc, "label");
  labelField.textContent = getString("preferences-field-label");
  const labelInput = el(doc, "input");
  labelInput.type = "text";
  labelInput.value = existing?.label ?? "";
  labelField.appendChild(labelInput);
  form.appendChild(labelField);

  const directionalField = el(doc, "label");
  const directionalInput = el(doc, "input");
  directionalInput.type = "checkbox";
  directionalInput.checked = existing?.directional ?? true;
  directionalField.append(
    directionalInput,
    getString("preferences-field-directional"),
  );
  form.appendChild(directionalField);

  const saveButton = el(doc, "button");
  saveButton.textContent = getString("preferences-save-button");
  saveButton.addEventListener("click", () => {
    const label = labelInput.value.trim();
    if (!label) {
      return;
    }
    const types = getLinkTypes();
    if (existing) {
      setLinkTypes(
        types.map((type) =>
          type.id === existing.id
            ? { ...type, label, directional: directionalInput.checked }
            : type,
        ),
      );
    } else {
      const newType: LinkType = {
        id: Zotero.Utilities.generateObjectKey(),
        label,
        directional: directionalInput.checked,
      };
      setLinkTypes([...types, newType]);
      selectedTypeId = newType.id;
    }
    mode = { kind: "list" };
    renderLinkTypesSettings(container);
  });
  form.appendChild(saveButton);

  const cancelButton = el(doc, "button");
  cancelButton.textContent = getString("preferences-cancel-button");
  cancelButton.addEventListener("click", () => {
    mode = { kind: "list" };
    renderLinkTypesSettings(container);
  });
  form.appendChild(cancelButton);
}

/**
 * Counts links referencing type `id` in the current mindmap document.
 * Returns null (rather than 0) when the document can't be read, so a
 * corrupt/unparseable note doesn't get reported as "unused".
 */
export async function countLinksUsingType(id: string): Promise<number | null> {
  try {
    const doc = await readMindmapDocument();
    return doc.links.filter((link) => link.typeId === id).length;
  } catch {
    return null;
  }
}

async function handleDelete(container: HTMLElement, id: string): Promise<void> {
  const count = await countLinksUsingType(id);

  if (count === 0) {
    performDelete(container, id);
    return;
  }

  const message =
    count === null
      ? getString("preferences-delete-confirm-unknown")
      : getString("preferences-delete-confirm-used", { args: { count } });

  const win = container.ownerDocument!
    .defaultView as unknown as mozIDOMWindowProxy | null;
  const confirmed = win
    ? Services.prompt.confirm(
        win,
        getString("preferences-delete-confirm-title"),
        message,
      )
    : false;
  if (confirmed) {
    performDelete(container, id);
  }
}

function performDelete(container: HTMLElement, id: string): void {
  setLinkTypes(getLinkTypes().filter((type) => type.id !== id));
  if (selectedTypeId === id) {
    selectedTypeId = null;
  }
  renderLinkTypesSettings(container);
}
