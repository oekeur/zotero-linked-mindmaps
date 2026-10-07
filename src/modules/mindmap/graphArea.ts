/**
 * The one painter for the mindmap tab's graph container and its dock.
 *
 * Several writers reach that area across awaits: the tab's load, its failed
 * and empty states, the live-refresh observer's graph and panels. Each used to
 * guard itself with its own belief about who else might have written since.
 * Here ownership is explicit instead: a writer takes a claim at the moment it
 * decides to write, a later claim supersedes every earlier one, and a paint
 * with a superseded claim is refused without touching the DOM. The newest
 * decision therefore always wins, whatever order the awaits resume in.
 */
import { config } from "../../../package.json";

export const MOUNT_CLASS = "mindmap-graph-mount";
export const STATE_CLASS = "mindmap-graph-state";

const HTML_NS = "http://www.w3.org/1999/xhtml";

export type GraphAreaOwner = "tab" | "live";

export type GraphAreaKind =
  "graph" | `panel:${string}` | `tab-state:${string}` | "failed" | "empty";

export interface Claim {
  readonly owner: GraphAreaOwner;
  readonly id: number;
}

/**
 * How a graph's node handlers write the dock. The write runs only while a
 * graph is on screen, so a handler of a graph that has since been replaced by
 * a panel cannot paint over it.
 */
export interface DockPort {
  write(fn: (dock: HTMLElement) => void): boolean;
}

export interface PaintOptions {
  /**
   * Leaves the dock as it is. A live rebuild of the graph already on screen
   * keeps the Connections panel the user is working in.
   */
  keepDock?: boolean;
  /**
   * What to leave on screen when `build` throws. The area never ends on a
   * blank: it paints this (same claim, same synchronous run, dock hidden and
   * emptied whatever `keepDock` said) and then rethrows the original error
   * for the caller to report.
   */
  onError?: {
    kind: GraphAreaKind;
    build: (mount: HTMLElement, err: unknown) => void;
  };
}

export interface GraphArea {
  /** Supersedes every earlier claim. */
  claim(owner: GraphAreaOwner): Claim;
  isCurrent(claim: Claim): boolean;
  /**
   * Disposes the current content, empties the container and hides and empties
   * the dock, then runs `build` synchronously on a fresh element that is
   * already attached. Only a graph gets a `MOUNT_CLASS` mount; every other
   * kind gets a plain wrapper. Returns undefined, changing nothing, when the
   * claim is superseded.
   */
  paint<T extends { dispose?(): void } | void>(
    claim: Claim,
    kind: GraphAreaKind,
    build: (mount: HTMLElement) => T,
    options?: PaintOptions,
  ): T | undefined;
  /** Disposes the current content and empties both surfaces. */
  clear(claim: Claim): boolean;
  /** The owner of the latest claim, and what is on screen. */
  current(): { owner: GraphAreaOwner; kind: GraphAreaKind };
  readonly dockPort: DockPort;
}

/**
 * Test-only. The spec bundle installs one on the plugin instance; it watches
 * the container and the dock for mutations that happen while no area
 * operation is running.
 */
export interface AreaGuard {
  register(container: HTMLElement, dock: HTMLElement): void;
  enter(): void;
  exit(): void;
}

function installedGuard(): AreaGuard | undefined {
  return (
    Zotero as unknown as Record<string, { areaGuard?: AreaGuard } | undefined>
  )[config.addonInstance]?.areaGuard;
}

export function createGraphArea(
  container: HTMLElement,
  dock: HTMLElement,
): GraphArea {
  const guard = installedGuard();
  guard?.register(container, dock);

  let epoch = 0;
  let owner: GraphAreaOwner = "tab";
  let kind: GraphAreaKind = "empty";
  let handle: { dispose?(): void } | undefined;

  function operate<R>(fn: () => R): R {
    guard?.enter();
    try {
      return fn();
    } finally {
      guard?.exit();
    }
  }

  function empty(keepDock: boolean): void {
    try {
      handle?.dispose?.();
    } finally {
      handle = undefined;
    }
    container.textContent = "";
    if (!keepDock) {
      dock.style.display = "none";
      dock.textContent = "";
    }
  }

  const dockPort: DockPort = {
    write(fn) {
      if (kind !== "graph") {
        return false;
      }
      operate(() => fn(dock));
      return true;
    },
  };

  return {
    claim(next) {
      epoch += 1;
      owner = next;
      return { owner: next, id: epoch };
    },
    isCurrent(claim) {
      return claim.id === epoch;
    },
    paint(claim, nextKind, build, options) {
      if (claim.id !== epoch) {
        return undefined;
      }
      return operate(() => {
        function attach(asKind: GraphAreaKind): HTMLElement {
          const wrapper = container.ownerDocument!.createElementNS(
            HTML_NS,
            "div",
          ) as unknown as HTMLElement;
          if (asKind === "graph") {
            wrapper.className = MOUNT_CLASS;
            wrapper.style.cssText =
              "width: 100%; height: 100%; min-width: 0; position: relative;";
          } else {
            wrapper.className = STATE_CLASS;
          }
          container.appendChild(wrapper);
          return wrapper;
        }
        empty(options?.keepDock === true);
        let result: ReturnType<typeof build>;
        try {
          result = build(attach(nextKind));
        } catch (err) {
          // Whatever build half-made goes, and so does the dock: it belongs
          // to a graph that no longer exists, and its close handler would be
          // refused.
          empty(false);
          kind = "failed";
          const fallback = options?.onError;
          if (fallback) {
            fallback.build(attach(fallback.kind), err);
            kind = fallback.kind;
          }
          throw err;
        }
        handle =
          result && typeof result === "object"
            ? (result as { dispose?(): void })
            : undefined;
        kind = nextKind;
        return result;
      });
    },
    clear(claim) {
      if (claim.id !== epoch) {
        return false;
      }
      operate(() => {
        empty(false);
        kind = "empty";
      });
      return true;
    },
    current() {
      return { owner, kind };
    },
    dockPort,
  };
}
