import { assert } from "chai";
import {
  BAND_HALF_WIDTH,
  deconflictLabelAnchors,
  labelBox,
  LABEL_FONT_SIZE,
  MAX_HALO_RADIUS,
  NODE_RADIUS,
  PIP_RADIUS,
  pipPositions,
  regionArea,
  regionContains,
  regionLabelAnchor,
  regionShapes,
} from "../../src/modules/mindmap/groupRegions";

describe("groupRegions", function () {
  describe("regionShapes", function () {
    it("draws nothing for a group with no members", function () {
      assert.deepEqual(regionShapes([]), []);
    });

    it("draws a lone member as a halo with no band", function () {
      const shapes = regionShapes([{ x: 0, y: 0 }]);

      assert.lengthOf(shapes, 1);
      assert.equal(shapes[0].kind, "halo");
    });

    it("joins n members with n-1 bands", function () {
      const shapes = regionShapes([
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 300 },
        { x: 0, y: 300 },
      ]);

      assert.lengthOf(
        shapes.filter((shape) => shape.kind === "band"),
        3,
      );
      assert.lengthOf(
        shapes.filter((shape) => shape.kind === "halo"),
        4,
      );
    });

    it("spans the members by their shortest tree, not in listed order", function () {
      // Listed far-first: a chain following the array would run the long way
      // round, so the total band length is what tells the two apart.
      const shapes = regionShapes([
        { x: 0, y: 0 },
        { x: 900, y: 0 },
        { x: 100, y: 0 },
      ]);
      const total = shapes
        .filter((shape) => shape.kind === "band")
        .reduce(
          (sum, band) => sum + Math.hypot(band.x2 - band.x1, band.y2 - band.y1),
          0,
        );

      assert.equal(total, 900, "the tree is not the minimum spanning one");
    });
  });

  describe("keeping non-members out (AC #2)", function () {
    it("drops a band that would run over a non-member", function () {
      const members = [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
      ];
      const between = { x: 200, y: 0 };

      assert.lengthOf(
        regionShapes(members, []).filter((shape) => shape.kind === "band"),
        1,
        "no band drawn without the non-member",
      );
      assert.lengthOf(
        regionShapes(members, [between]).filter(
          (shape) => shape.kind === "band",
        ),
        0,
        "the band still runs over the non-member",
      );
    });

    it("keeps a band clearing a non-member by more than its half-width", function () {
      const clear = { x: 200, y: BAND_HALF_WIDTH + 5 };
      const shapes = regionShapes(
        [
          { x: 0, y: 0 },
          { x: 400, y: 0 },
        ],
        [clear],
      );

      assert.lengthOf(
        shapes.filter((shape) => shape.kind === "band"),
        1,
      );
      assert.isFalse(regionContains(shapes, clear));
    });

    it("pulls a halo in to stop short of a nearby non-member", function () {
      const near = { x: NODE_RADIUS + 6, y: 0 };
      const shapes = regionShapes([{ x: 0, y: 0 }], [near]);

      assert.isBelow(
        (shapes[0] as { radius: number }).radius,
        MAX_HALO_RADIUS,
        "the halo kept its full reach next to a non-member",
      );
      assert.isFalse(regionContains(shapes, near));
    });

    it("never shrinks a halo below the node it hugs", function () {
      // Closer than NODE_RADIUS means the two nodes already overlap on screen.
      // The halo stops there rather than vanishing behind its own member, and
      // this is the documented exception to the guarantee above.
      const overlapping = { x: 4, y: 0 };
      const shapes = regionShapes([{ x: 0, y: 0 }], [overlapping]);

      assert.equal((shapes[0] as { radius: number }).radius, NODE_RADIUS);
    });

    it("leaves a scattered group's non-members out where a bounding box would not", function () {
      const members = [
        { x: 0, y: 0 },
        { x: 800, y: 0 },
        { x: 800, y: 600 },
      ];
      const others = [
        { x: 400, y: 300 },
        { x: 200, y: 500 },
        { x: 650, y: 120 },
      ];
      const shapes = regionShapes(members, others);

      for (const other of others) {
        assert.isFalse(
          regionContains(shapes, other),
          `the region reached (${other.x}, ${other.y})`,
        );
      }
      for (const member of members) {
        assert.isTrue(regionContains(shapes, member));
      }
    });
  });

  describe("regionArea", function () {
    it("orders a tight region below a sprawling one, so the smaller wins a click", function () {
      const tight = regionShapes([
        { x: 0, y: 0 },
        { x: 60, y: 0 },
      ]);
      const sprawling = regionShapes([
        { x: 0, y: 0 },
        { x: 900, y: 700 },
      ]);

      assert.isBelow(regionArea(tight), regionArea(sprawling));
    });

    it("is zero for a group with nothing drawn", function () {
      assert.equal(regionArea([]), 0);
    });
  });

  describe("regionLabelAnchor", function () {
    it("sits above the topmost halo", function () {
      const anchor = regionLabelAnchor(
        regionShapes([
          { x: 0, y: 400 },
          { x: 120, y: 100 },
        ]),
      );

      assert.equal(anchor!.x, 120);
      assert.isBelow(anchor!.y, 100 - NODE_RADIUS);
    });

    it("has nowhere to go when nothing is drawn", function () {
      assert.isNull(regionLabelAnchor([]));
    });
  });

  describe("deconflictLabelAnchors (AC #4)", function () {
    it("leaves labels that do not touch exactly where they were", function () {
      const labels = [
        { name: "Chapter one", anchor: { x: 0, y: 0 } },
        { name: "Methodology", anchor: { x: 600, y: 4 } },
      ];

      assert.deepEqual(
        deconflictLabelAnchors(labels),
        labels.map((label) => label.anchor),
      );
    });

    it("pushes the lower of two colliding labels clear of the upper", function () {
      const anchors = deconflictLabelAnchors([
        { name: "Methodology", anchor: { x: 100, y: 4 } },
        { name: "Chapter one", anchor: { x: 100, y: 0 } },
      ]);

      // The higher one keeps its place; the reader is tracing its region up
      // from the members, and moving it would break that line.
      assert.deepEqual(anchors[1], { x: 100, y: 0 });
      assert.isAbove(anchors[0].y, anchors[1].y + LABEL_FONT_SIZE);
      assert.equal(anchors[0].x, 100, "a label moved sideways off its region");
    });

    it("separates three labels stacked on one point", function () {
      const anchors = deconflictLabelAnchors(
        ["A group", "B group", "C group"].map((name) => ({
          name,
          anchor: { x: 50, y: 200 },
        })),
      );

      for (let i = 0; i < anchors.length; i += 1) {
        for (let j = i + 1; j < anchors.length; j += 1) {
          const a = labelBox("A group", anchors[i]);
          const b = labelBox("A group", anchors[j]);
          assert.isTrue(
            a.y2 <= b.y1 || b.y2 <= a.y1,
            `labels ${i} and ${j} still overlap`,
          );
        }
      }
    });

    it("has nothing to place for a graph with no named group", function () {
      assert.deepEqual(deconflictLabelAnchors([]), []);
    });
  });

  describe("pipPositions (AC #3)", function () {
    it("centres one pip under its node, clear of it", function () {
      const [pip] = pipPositions({ x: 100, y: 100 }, 1);

      assert.equal(pip.x, 100);
      assert.isAbove(pip.y - PIP_RADIUS, 100 + NODE_RADIUS);
    });

    it("spreads a row that stays centred as memberships are added", function () {
      for (const count of [2, 3, 4]) {
        const pips = pipPositions({ x: 0, y: 0 }, count);

        assert.lengthOf(pips, count);
        assert.approximately(
          pips.reduce((sum, pip) => sum + pip.x, 0) / count,
          0,
          1e-9,
          `a row of ${count} pips is off-centre`,
        );
      }
    });

    it("leaves a gap between neighbouring pips, so they read as separate", function () {
      const [first, second] = pipPositions({ x: 0, y: 0 }, 2);

      assert.isAbove(second.x - first.x, PIP_RADIUS * 2);
    });

    it("keeps every pip on one baseline", function () {
      const pips = pipPositions({ x: 0, y: 40 }, 3);

      assert.deepEqual(new Set(pips.map((pip) => pip.y)).size, 1);
    });
  });
});
