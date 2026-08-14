import cytoscape from "cytoscape";
import { ensureCytoscapeWindowGlobals } from "../utils/cytoscapeGlobalsPolyfill";

// TASK-1 spike: disposable, not real plugin code. Delete this whole src/spike/
// directory (and its wiring in hooks.ts) once findings are recorded.

const LOG_PATH = "/home/oscar/projects/zoteroMindmap/.scaffold/spike-debug.log";

let loggingBroken = false;

function logToFile(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    IOUtils.writeUTF8(LOG_PATH, line, { mode: "appendOrCreate" }).catch(
      (e: any) => {
        if (loggingBroken) return;
        loggingBroken = true;
        ztoolkit.getGlobal("alert")(
          "[cytoscape spike] logToFile write failed: " + e,
        );
      },
    );
  } catch (e) {
    if (loggingBroken) return;
    loggingBroken = true;
    ztoolkit.getGlobal("alert")("[cytoscape spike] logToFile threw sync: " + e);
  }
}

// Zotero's main chrome window is a XUL document with no <head> element, but
// cytoscape's canvas renderer unconditionally does document.head.insertBefore(...)
// on init to inject a stylesheet. Shim a <head> in so that doesn't throw.
function ensureDocumentHead(doc: Document) {
  if (doc.head) return;
  const head = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "head",
  ) as unknown as HTMLHeadElement;
  doc.documentElement?.appendChild(head as unknown as Node);
  Object.defineProperty(doc, "head", { value: head, configurable: true });
}

export function renderSpikeGraph(container: HTMLElement) {
  return cytoscape({
    container,
    elements: {
      nodes: [
        { data: { id: "n1", label: "n1" } },
        { data: { id: "n2", label: "n2" } },
        { data: { id: "n3", label: "n3" } },
        { data: { id: "n4", label: "n4" } },
        { data: { id: "n5", label: "n5" } },
        { data: { id: "n6", label: "n6" } },
      ],
      edges: [
        { data: { id: "e1", source: "n1", target: "n2", label: "cites" } },
        { data: { id: "e2", source: "n2", target: "n3", label: "cites" } },
        { data: { id: "e3", source: "n3", target: "n4", label: "cites" } },
        { data: { id: "e4", source: "n4", target: "n5", label: "cites" } },
        {
          data: {
            id: "e5",
            source: "n1",
            target: "n2",
            label: "cites-again",
          },
          classes: "parallel",
        },
      ],
    },
    style: [
      {
        selector: "node",
        style: {
          label: "data(label)",
          "background-color": "#4a90d9",
          color: "#fff",
          "text-valign": "center",
          "text-halign": "center",
          width: 30,
          height: 30,
          "font-size": 10,
        },
      },
      {
        selector: "edge",
        style: {
          label: "data(label)",
          width: 2,
          "line-color": "#999",
          "target-arrow-color": "#999",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          "font-size": 8,
        },
      },
      {
        selector: "edge.parallel",
        style: {
          "curve-style": "bezier",
          "control-point-step-size": 40,
          "line-color": "#d9534f",
          "target-arrow-color": "#d9534f",
        },
      },
    ],
    layout: { name: "cose" },
  });
}

export function openSpikeTab() {
  const Zotero_Tabs = ztoolkit.getGlobal("Zotero_Tabs");
  const { container } = Zotero_Tabs.add({
    type: "zoterolinkedmindmaps-spike",
    title: "Cytoscape Spike",
    data: {},
    select: true,
    onClose: () => {
      logToFile("tab closed");
    },
  });

  const doc = container.ownerDocument!;
  ensureDocumentHead(doc);
  ensureCytoscapeWindowGlobals(doc.defaultView!);

  const div = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as unknown as HTMLElement;
  div.id = "spike-container";
  div.style.cssText = "width: 100%; height: 100%; position: relative;";
  container.appendChild(div as unknown as Node);

  const cy = renderSpikeGraph(div);
  cy.on("tap", "node", (evt) => {
    const node = evt.target;
    node.style("border-width", 4);
    node.style("border-color", "#f5a623");
  });

  return cy;
}

export function registerSpikeShortcut() {
  logToFile("registerSpikeShortcut called");
  ztoolkit.Keyboard.register((ev, keyOptions) => {
    if (keyOptions.keyboard?.equals("shift,g")) {
      logToFile("shift+g matched, opening tab");
      try {
        openSpikeTab();
        logToFile("openSpikeTab returned OK");
      } catch (e) {
        logToFile(
          "openSpikeTab threw " +
            e +
            (e instanceof Error ? "\n" + e.stack : ""),
        );
      }
    }
  });
}
