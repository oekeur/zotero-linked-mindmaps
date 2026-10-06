function mainWindowFTLHref(): string {
  return `${addon.data.config.addonRef}-mainWindow.ftl`;
}

function mainWindowFTLLinks(doc: Document): Element[] {
  const href = mainWindowFTLHref();
  const links = Array.from(
    doc.querySelectorAll('link[rel="localization"]'),
  ) as Element[];
  return links.filter((link) => link.getAttribute("href") === href);
}

/**
 * Links mainWindow.ftl into the window once, into its <linkset>.
 *
 * Not MozXULElement.insertFTLIfNeeded: that appends to document.head when
 * there is one, and only checks its own container for an existing link, so a
 * load after the tab shimmed a head (as when the plugin is re-enabled) added a
 * second link for the same file. Both links share one resource id, so removing
 * either drops the id while the other stays in the DOM. One link in a known
 * place can be removed in full.
 */
export function ensureMainWindowFTL(doc: Document): void {
  if (mainWindowFTLLinks(doc).length > 0) {
    return;
  }
  const link = doc.createElementNS("http://www.w3.org/1999/xhtml", "link");
  link.setAttribute("rel", "localization");
  link.setAttribute("href", mainWindowFTLHref());
  (doc.querySelector("linkset") ?? doc.documentElement)?.appendChild(link);
}

/**
 * Takes mainWindow.ftl back out. Left linked after the plugin shuts down, its
 * file can no longer be loaded, every document.l10n.translateFragment in the
 * window rejects, and Zotero's item context menu, whose build awaits one,
 * stops opening until Zotero restarts. Removing the link is what drops the
 * resource from the window's localization.
 */
export function removeMainWindowFTL(doc: Document): void {
  for (const link of mainWindowFTLLinks(doc)) {
    link.remove();
  }
}
