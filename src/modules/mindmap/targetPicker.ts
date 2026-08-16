/**
 * Link-target picker: delegates to Zotero's own native item-selector
 * dialog (chrome://zotero/content/selectItemsDialog.xhtml) -- the same
 * dialog the built-in Related panel's "+" button uses -- rather than
 * building a custom search UI. A dialog opened via ztoolkit.Dialog has no
 * `require`, which the toolkit's VirtualizedTableHelper needs for its
 * bundled React table; the native dialog runs in Zotero's main window and
 * has no such dependency.
 */
/**
 * Resolves with the item the user picked, or null if they cancelled. Returns
 * the item rather than a ref so the caller can tell an ineligible pick from a
 * cancelled one and say so; eligibility is canBeMindmapNode's call, and the
 * message belongs next to the form's other validation.
 *
 * onlyRegularItems is off, which is what makes notes selectable: Zotero's
 * dialog passes the flag straight through to the item tree as `regularOnly`,
 * and with it off the tree shows standalone notes and expands parents so
 * child notes are rows of their own. isRegularItem is the tree's only filter
 * predicate - there is no "notes but not attachments" flag - so attachments
 * become selectable too and are rejected after the fact.
 */
export async function openTargetPicker(): Promise<Zotero.Item | null> {
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
    onlyRegularItems: false,
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
  return Zotero.Items.get(itemID);
}
