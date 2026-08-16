/**
 * The two bits of DOM building the mindmap UI does everywhere: a button whose
 * text comes from Fluent, and a dropdown over the library's mindmaps.
 *
 * Neither creates the element it appends into, and options inherit their
 * select's namespace rather than assuming one. That matters: the tab builds
 * its controls in the XHTML namespace because it renders into a XUL document,
 * while the item-pane surfaces use plain createElement. Picking a namespace
 * here would silently change what one of them produces.
 */
import { getLocaleID } from "../../utils/locale";
import type { FluentMessageId } from "../../../typings/i10n";
import type { MindmapSummary } from "./storage";

export function appendL10nButton(
  parent: HTMLElement,
  localeId: FluentMessageId,
  onClick?: () => void,
): HTMLButtonElement {
  const button = parent.ownerDocument!.createElement("button");
  button.setAttribute("data-l10n-id", getLocaleID(localeId));
  if (onClick) {
    button.addEventListener("click", onClick);
  }
  parent.appendChild(button);
  return button;
}

/**
 * Fills `select` with one option per mindmap: the id as value, the title as
 * text, and the description as a tooltip where there is one.
 */
export function appendMindmapOptions(
  select: HTMLSelectElement,
  mindmaps: MindmapSummary[],
): void {
  const doc = select.ownerDocument!;
  for (const mindmap of mindmaps) {
    const option = doc.createElementNS(
      select.namespaceURI,
      "option",
    ) as unknown as HTMLOptionElement;
    option.value = mindmap.id;
    option.textContent = mindmap.title;
    if (mindmap.description) {
      option.title = mindmap.description;
    }
    select.appendChild(option as unknown as Node);
  }
}
