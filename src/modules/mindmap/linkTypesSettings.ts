/**
 * Preferences-pane UI for the link-type vocabulary: lets a user list, add,
 * edit, and delete types on top of linkTypes.ts's Zotero.Prefs-backed
 * storage. Renders with direct DOM creation into a container the pane's
 * XHTML fragment hands over on load - no separate dialog window.
 *
 * The container is rebuilt from scratch on every state change (selection,
 * add, edit, delete), so its text can't go through data-l10n-id: Zotero
 * translates a plugin pane's static fragment once, when the pane first
 * loads, and never revisits nodes inserted afterward. getString sidesteps
 * that - it reads the plugin's own Fluent bundle directly rather than
 * relying on any window's l10n context, so it resolves the same way here as
 * everywhere else in the plugin.
 */
import { getString } from "../../utils/locale";
import { findAllMindmapNotes, readDocumentFromNote } from "./storage";
import { getLinkTypes, setLinkTypes, type LinkType } from "./linkTypes";

const HTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";

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
 * The line the graph draws for a directional or undirected type, at row
 * scale. Same shapes graphRenderer.ts's edge stylesheet draws on the graph
 * itself, so a type reads the same way here as it does once drawn.
 */
function appendLineGlyph(
  parent: Element,
  doc: Document,
  directional: boolean,
): void {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "6");
  svg.setAttribute("viewBox", "0 0 16 6");
  svg.setAttribute("aria-hidden", "true");

  const line = doc.createElementNS(SVG_NS, "path");
  line.setAttribute("stroke-width", "1.4");
  line.setAttribute("fill", "none");

  if (directional) {
    line.setAttribute("d", "M0 3h9");
    line.setAttribute("stroke-dasharray", "3 2");
    svg.appendChild(line);
    const head = doc.createElementNS(SVG_NS, "path");
    head.setAttribute("d", "M9 0.8L13 3l-4 2.2z");
    head.setAttribute("fill", "currentColor");
    head.setAttribute("stroke", "none");
    svg.appendChild(head);
  } else {
    line.setAttribute("d", "M0 3h14");
    svg.appendChild(line);
  }

  parent.appendChild(svg);
}

/** A stroked path in its own 16x16 box, sized and coloured by the sheet. */
function appendGlyph(parent: Element, doc: Document, path: string): void {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const glyphPath = doc.createElementNS(SVG_NS, "path");
  glyphPath.setAttribute("d", path);
  svg.appendChild(glyphPath);
  parent.appendChild(svg);
}

function appendIconButton(
  parent: HTMLElement,
  doc: Document,
  className: string,
  path: string,
  title: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = el(doc, "button");
  button.classList.add("zoterolinkedmindmaps-type-icon-button", className);
  button.title = title;
  button.addEventListener("click", onClick);
  appendGlyph(button, doc, path);
  parent.appendChild(button);
  return button;
}

/**
 * Renders (or re-renders) the link-types settings UI into `container`. Safe
 * to call repeatedly - each call clears and rebuilds from current storage
 * and module state, which is how every state transition below redraws. The
 * container's own heading lives in the pane's XHTML, not here.
 */
export function renderLinkTypesSettings(container: HTMLElement): void {
  container.textContent = "";

  if (mode.kind !== "list") {
    renderForm(container, mode.kind === "edit" ? mode.id : null);
    return;
  }

  renderList(container);
}

function renderList(container: HTMLElement): void {
  const doc = container.ownerDocument!;
  const types = getLinkTypes();
  const hasSelection =
    selectedTypeId !== null && types.some((type) => type.id === selectedTypeId);

  const table = el(doc, "table");
  table.classList.add("zoterolinkedmindmaps-type-table");
  container.appendChild(table);

  const head = el(doc, "thead");
  const headRow = el(doc, "tr");
  const labelHead = el(doc, "th");
  labelHead.textContent = getString("preferences-column-label");
  const directionalHead = el(doc, "th");
  directionalHead.textContent = getString("preferences-column-directional");
  headRow.append(labelHead, directionalHead);
  head.appendChild(headRow);
  table.appendChild(head);

  const body = el(doc, "tbody");
  table.appendChild(body);

  for (const type of types) {
    const row = el(doc, "tr");
    row.classList.add("zoterolinkedmindmaps-type-row");
    if (type.id === selectedTypeId) {
      row.classList.add("selected");
    }
    row.addEventListener("click", () => {
      selectedTypeId = type.id;
      renderLinkTypesSettings(container);
    });

    const labelCell = el(doc, "td");
    labelCell.textContent = type.label;

    const lineCell = el(doc, "td");
    const line = el(doc, "span");
    line.classList.add("zoterolinkedmindmaps-type-line");
    appendLineGlyph(line, doc, type.directional);
    const lineLabel = el(doc, "span");
    lineLabel.classList.add("zoterolinkedmindmaps-type-line-label");
    lineLabel.textContent = getString(
      type.directional
        ? "preferences-type-directional"
        : "preferences-type-undirected",
    );
    line.appendChild(lineLabel);
    lineCell.appendChild(line);

    row.append(labelCell, lineCell);
    body.appendChild(row);
  }

  const footer = el(doc, "div");
  footer.classList.add("zoterolinkedmindmaps-type-footer");
  container.appendChild(footer);

  appendIconButton(
    footer,
    doc,
    "zoterolinkedmindmaps-type-add",
    "M8 4v8M4 8h8",
    getString("preferences-add-button"),
    () => {
      mode = { kind: "add" };
      renderLinkTypesSettings(container);
    },
  );

  const editButton = el(doc, "button");
  editButton.classList.add("zoterolinkedmindmaps-type-edit");
  editButton.textContent = getString("preferences-edit-button");
  editButton.disabled = !hasSelection;
  editButton.addEventListener("click", () => {
    if (!selectedTypeId) return;
    mode = { kind: "edit", id: selectedTypeId };
    renderLinkTypesSettings(container);
  });
  footer.appendChild(editButton);

  const removeButton = appendIconButton(
    footer,
    doc,
    "zoterolinkedmindmaps-type-remove",
    "M4 8h8",
    getString("preferences-delete-button"),
    () => {
      if (!selectedTypeId) return;
      void handleDelete(container, selectedTypeId);
    },
  );
  removeButton.disabled = !hasSelection;
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
  saveButton.classList.add("zoterolinkedmindmaps-type-save");
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
  cancelButton.classList.add("zoterolinkedmindmaps-type-cancel");
  cancelButton.textContent = getString("preferences-cancel-button");
  cancelButton.addEventListener("click", () => {
    mode = { kind: "list" };
    renderLinkTypesSettings(container);
  });
  form.appendChild(cancelButton);
}

/**
 * Counts links referencing type `id` across every mindmap in every library.
 * The vocabulary lives in prefs, so it is shared by all of them; counting only
 * the user library would report a type used exclusively by a group-library
 * mindmap as unused, and delete it with no confirmation at all. Returns null
 * (rather than 0) when a mindmap can't be read, so a corrupt note isn't
 * reported as "unused" either.
 */
export async function countLinksUsingType(id: string): Promise<number | null> {
  try {
    let count = 0;
    // Reads the notes directly rather than going through listMindmaps, which
    // skips a note it cannot parse. Here that would report a corrupt mindmap's
    // links as zero and let the type be deleted with no warning at all.
    for (const library of Zotero.Libraries.getAll()) {
      for (const note of await findAllMindmapNotes(library.libraryID)) {
        const doc = readDocumentFromNote(note);
        count += doc.links.filter((link) => link.typeId === id).length;
      }
    }
    return count;
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
