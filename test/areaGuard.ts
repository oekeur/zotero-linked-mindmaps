import { config } from "../package.json";
import type { AreaGuard } from "../src/modules/mindmap/graphArea";

interface Watched {
  container: HTMLElement;
  observers: MutationObserver[];
}

/**
 * Watches the container and the dock of every graph area created while it is
 * installed. A childList mutation on either, with subtree off so Cytoscape's
 * own DOM inside the mount is not counted, that happens while no area
 * operation is running is a violation: some writer painted without going
 * through the area.
 *
 * One depth counter covers every registered area. A mutation records are
 * only delivered after the fact, so the boundaries drain them synchronously
 * with takeRecords(): records pending when an operation starts were made
 * outside one; records made during it are discarded when it ends. Two areas
 * over the same surfaces therefore cannot report each other's paints.
 */
export class AreaGuardImpl implements AreaGuard {
  readonly violations: string[] = [];
  private depth = 0;
  private watched: Watched[] = [];

  register(container: HTMLElement, dock: HTMLElement): void {
    const win = container.ownerDocument!.defaultView!;
    const observers = [container, dock].map((target) => {
      // Operations are synchronous, so records still undelivered when this
      // runs were made outside one: enter() and exit() take everything else.
      const observer = new win.MutationObserver((records: MutationRecord[]) =>
        this.record(target, records),
      );
      observer.observe(target, { childList: true });
      return observer;
    });
    this.watched.push({ container, observers });
  }

  enter(): void {
    if (this.depth === 0) {
      this.drain(true);
    }
    this.depth += 1;
  }

  exit(): void {
    this.depth -= 1;
    if (this.depth === 0) {
      this.drain(false);
    }
  }

  /** Reports anything pending, then forgets areas whose container is gone. */
  settle(): string[] {
    this.drain(true);
    const found = this.violations.splice(0);
    this.watched = this.watched.filter((entry) => {
      if (entry.container.isConnected) {
        return true;
      }
      entry.observers.forEach((observer) => observer.disconnect());
      return false;
    });
    return found;
  }

  private drain(report: boolean): void {
    for (const entry of this.watched) {
      for (const observer of entry.observers) {
        const records = observer.takeRecords();
        if (report && records.length > 0) {
          this.record(records[0].target as Element, records);
        }
      }
    }
  }

  private record(target: Element, records: MutationRecord[]): void {
    this.violations.push(
      `${records.length} childList mutation(s) on <${target.localName} id="${target.id}"> outside a graph-area operation`,
    );
  }
}

function installed(): AreaGuard | undefined {
  return (
    Zotero as unknown as Record<string, { areaGuard?: AreaGuard } | undefined>
  )[config.addonInstance]?.areaGuard;
}

/**
 * Runs a deliberate, test-made mutation of a guarded surface (simulating a
 * foreign writer) without it counting as a violation.
 */
export function withoutAreaGuard(fn: () => void): void {
  const guard = installed();
  guard?.enter();
  try {
    fn();
  } finally {
    guard?.exit();
  }
}
