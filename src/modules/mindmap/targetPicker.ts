/**
 * Link-target picker: delegates to Zotero's own native item-selector
 * dialog (chrome://zotero/content/selectItemsDialog.xhtml) -- the same
 * dialog the built-in Related panel's "+" button uses -- rather than
 * building a custom search UI. A dialog opened via ztoolkit.Dialog has no
 * `require`, which the toolkit's VirtualizedTableHelper needs for its
 * bundled React table; the native dialog runs in Zotero's main window and
 * has no such dependency.
 */
import type { ZoteroObjectRef } from "./schema";

export function toRef(item: Zotero.Item): ZoteroObjectRef {
  return { kind: "item", libraryID: item.libraryID, key: item.key };
}

/**
 * Opens the picker dialog and resolves with the chosen item's
 * ZoteroObjectRef, or null if the user cancels/closes without selecting.
 */
export async function openTargetPicker(): Promise<ZoteroObjectRef | null> {
  const io: {
    dataIn: null;
    dataOut: number[] | null;
    filterLibraryIDs: number[];
    singleSelection: boolean;
    onlyRegularItems: boolean;
  } = {
    dataIn: null,
    dataOut: null,
    filterLibraryIDs: [Zotero.Libraries.userLibraryID],
    singleSelection: true,
    onlyRegularItems: true,
  };

  Zotero.getMainWindow().openDialog(
    "chrome://zotero/content/selectItemsDialog.xhtml",
    "",
    "chrome,dialog=no,modal,centerscreen,resizable=yes",
    io,
  );

  const itemID = io.dataOut?.[0];
  if (!itemID) {
    return null;
  }
  const item = Zotero.Items.get(itemID);
  return toRef(item);
}
