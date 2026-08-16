import { assert } from "chai";
import { pruneDanglingExternalNodes } from "../../src/modules/mindmap/crossMindmapCleanup";
import {
  createMindmap,
  deleteMindmap,
  findAllMindmapNotes,
  listMindmaps,
  readMindmapDocument,
  whenStorageIdle,
  writeMindmapDocument,
} from "../../src/modules/mindmap/storage";
import { CURRENT_SCHEMA_VERSION } from "../../src/modules/mindmap/schema";
import type {
  MindmapDocument,
  MindmapLink,
  MindmapNode,
} from "../../src/modules/mindmap/schema";

const REF = {
  kind: "item" as const,
  libraryID: 1,
  key: "CROSSREF1",
};

function member(id: string): MindmapNode {
  return { membership: "member", id, position: { x: 0, y: 0 }, ref: REF };
}

function external(
  id: string,
  homeMindmapId: string,
  homeNodeId: string,
): MindmapNode {
  return {
    membership: "external",
    id,
    position: { x: 0, y: 0 },
    ref: REF,
    homeMindmapId,
    homeNodeId,
  };
}

function link(id: string, source: string, target: string): MindmapLink {
  return { id, typeId: "cites", sourceNodeId: source, targetNodeId: target };
}

function docWith(
  id: string,
  title: string,
  nodes: MindmapNode[],
  links: MindmapLink[],
): MindmapDocument {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, id, title, nodes, links };
}

describe("mindmap/crossMindmapCleanup", function () {
  async function clearStorageNotes() {
    for (const item of await findAllMindmapNotes()) {
      await item.eraseTx();
    }
  }

  beforeEach(async function () {
    this.timeout(30000);
    await clearStorageNotes();
  });

  after(async function () {
    this.timeout(30000);
    await clearStorageNotes();
  });

  /**
   * Two mindmaps: "target" owns a member node, "home" owns a link reaching
   * into it through an external stub.
   */
  async function buildPair() {
    const target = await createMindmap("Target");
    const home = await createMindmap("Home");
    await writeMindmapDocument(
      docWith(target.id, "Target", [member("t-node")], []),
    );
    await writeMindmapDocument(
      docWith(
        home.id,
        "Home",
        [member("h-node"), external("h-external", target.id, "t-node")],
        [link("h-link", "h-node", "h-external")],
      ),
    );
    return { home, target };
  }

  it("keeps a stub whose mindmap and node both still exist", async function () {
    this.timeout(30000);
    const { home } = await buildPair();

    const changed = await pruneDanglingExternalNodes();

    assert.isEmpty(changed);
    const doc = await readMindmapDocument(home.id);
    assert.equal(doc.nodes.length, 2);
    assert.equal(doc.links.length, 1);
  });

  it("drops a stub and its link when the target mindmap is deleted (AC #3)", async function () {
    this.timeout(30000);
    const { home, target } = await buildPair();

    await deleteMindmap(target.id);
    // Erasing the note fires a delete notification, and the deletion observer
    // reconciles on it, so the pruning may already have happened. Running it
    // again has to be safe, and the end state is what matters either way.
    await Zotero.Promise.delay(300);
    await whenStorageIdle();
    await pruneDanglingExternalNodes();

    const doc = await readMindmapDocument(home.id);
    assert.deepEqual(
      doc.nodes.map((node) => node.id),
      ["h-node"],
    );
    assert.isEmpty(doc.links);
  });

  it("drops a stub and its link when just the target node is removed (AC #3)", async function () {
    this.timeout(30000);
    const { home, target } = await buildPair();

    await writeMindmapDocument(docWith(target.id, "Target", [], []));
    const changed = await pruneDanglingExternalNodes();

    assert.deepEqual(changed, [home.id]);
    const doc = await readMindmapDocument(home.id);
    assert.deepEqual(
      doc.nodes.map((node) => node.id),
      ["h-node"],
    );
    assert.isEmpty(doc.links);
  });

  it("leaves the home mindmap's own nodes and unrelated links alone", async function () {
    this.timeout(30000);
    const { home, target } = await buildPair();
    await writeMindmapDocument(
      docWith(
        home.id,
        "Home",
        [
          member("h-node"),
          member("h-other"),
          external("h-external", target.id, "t-node"),
        ],
        [
          link("h-own", "h-node", "h-other"),
          link("h-link", "h-node", "h-external"),
        ],
      ),
    );

    await deleteMindmap(target.id);
    await Zotero.Promise.delay(300);
    await whenStorageIdle();
    await pruneDanglingExternalNodes();

    const doc = await readMindmapDocument(home.id);
    assert.deepEqual(doc.nodes.map((node) => node.id).sort(), [
      "h-node",
      "h-other",
    ]);
    assert.deepEqual(
      doc.links.map((entry) => entry.id),
      ["h-own"],
    );
  });

  it("deleting the home mindmap leaves the target mindmap untouched (AC #2)", async function () {
    this.timeout(30000);
    const { home, target } = await buildPair();

    await deleteMindmap(home.id);

    assert.deepEqual(
      (await listMindmaps()).map((entry) => entry.id),
      [target.id],
    );
    const doc = await readMindmapDocument(target.id);
    assert.deepEqual(
      doc.nodes.map((node) => node.id),
      ["t-node"],
    );
  });

  it("does not treat another mindmap's own stub as a reachable target", async function () {
    this.timeout(30000);
    const first = await createMindmap("First");
    const second = await createMindmap("Second");
    const third = await createMindmap("Third");
    // second borrows from first; third tries to borrow second's borrowing.
    await writeMindmapDocument(
      docWith(first.id, "First", [member("f-node")], []),
    );
    await writeMindmapDocument(
      docWith(second.id, "Second", [external("s-ext", first.id, "f-node")], []),
    );
    await writeMindmapDocument(
      docWith(third.id, "Third", [external("t-ext", second.id, "s-ext")], []),
    );

    const changed = await pruneDanglingExternalNodes();

    assert.deepEqual(changed, [third.id]);
    assert.isEmpty((await readMindmapDocument(third.id)).nodes);
    assert.equal((await readMindmapDocument(second.id)).nodes.length, 1);
  });
});
