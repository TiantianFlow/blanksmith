// Serialized reconciliation coordinator.
//
// A single shared queue that serializes all dynamic content-script
// registration reconciliation. Every trigger — post-mutation sync from the
// message handler, startup, storage.onChanged, permissions.onAdded/onRemoved —
// enqueues through the same instance, so no two reconcileRegistrations calls
// ever overlap. This prevents the duplicate-registration race where two
// observers both see no registration and both try to register the identical
// script.
//
// Per-caller failure handling:
//   - requireSuccess=true (message-handler mutations): the caller awaits and
//     sees the original error if reconciliation fails.
//   - requireSuccess=false (fire-and-forget event triggers): errors are logged
//     via console.error but do not reject the returned promise and do not poison
//     the queue — the next enqueue still runs.

import type { GlobalMode } from "../domain/types";
import type { StorageArea } from "../storage/site-rules";
import { readRules } from "../storage/site-rules";
import { reconcileRegistrations, type ScriptingApi, type PermissionsApi } from "./registration";

export class SyncCoordinator {
  private chain: Promise<void> = Promise.resolve();
  private mode: GlobalMode = "include-only";

  constructor(
    private readonly storage: StorageArea,
    private readonly scripting: ScriptingApi,
    private readonly permissions?: PermissionsApi,
  ) {}

  setMode(mode: GlobalMode): void {
    this.mode = mode;
  }

  getMode(): GlobalMode {
    return this.mode;
  }

  enqueue(requireSuccess: boolean): Promise<void> {
    const run = this.chain.then(() =>
      readRules(this.storage).then((rules) =>
        reconcileRegistrations(rules, this.scripting, this.mode, this.permissions),
      ),
    );
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    if (requireSuccess) {
      return run;
    }
    return run.catch((error) => {
      console.error("[spl] background sync error:", error);
    });
  }
}
