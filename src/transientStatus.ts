import { useEffect, useMemo, useState } from "react";

export interface StatusScheduler<Handle = number> {
  schedule(callback: () => void, delayMs: number): Handle;
  cancel(handle: Handle): void;
}

export interface TransientStatusAction {
  show(message: string, clearAfterMs?: number): void;
}

export interface TransientStatusController {
  begin(): TransientStatusAction;
  run(
    operation: () => Promise<void>,
    successMessage: string,
    failureMessage: string,
    clearAfterMs: number,
  ): Promise<void>;
  cancel(): void;
}

const browserScheduler: StatusScheduler = {
  schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancel: (handle) => window.clearTimeout(handle),
};

export function createTransientStatusController<Handle = number>(
  commit: (status: string) => void,
  scheduler: StatusScheduler<Handle> = browserScheduler as StatusScheduler<Handle>,
): TransientStatusController {
  let generation = 0;
  let resetTimer: Handle | null = null;

  const cancelReset = () => {
    if (resetTimer === null) return;
    scheduler.cancel(resetTimer);
    resetTimer = null;
  };

  const begin = (): TransientStatusAction => {
    const actionGeneration = ++generation;
    cancelReset();

    return {
      show(message, clearAfterMs) {
        if (actionGeneration !== generation) return;
        cancelReset();
        commit(message);

        if (clearAfterMs === undefined) return;
        let scheduledTimer: Handle;
        scheduledTimer = scheduler.schedule(() => {
          if (resetTimer !== scheduledTimer) return;
          resetTimer = null;
          if (actionGeneration === generation) commit("");
        }, clearAfterMs);
        resetTimer = scheduledTimer;
      },
    };
  };

  return {
    begin,
    async run(operation, successMessage, failureMessage, clearAfterMs) {
      const action = begin();
      try {
        await operation();
        action.show(successMessage, clearAfterMs);
      } catch {
        action.show(failureMessage, clearAfterMs);
      }
    },
    cancel() {
      generation += 1;
      cancelReset();
    },
  };
}

export function useTransientStatus(): readonly [string, TransientStatusController] {
  const [status, setStatus] = useState("");
  const controller = useMemo(
    () => createTransientStatusController(setStatus),
    [setStatus],
  );

  useEffect(() => () => controller.cancel(), [controller]);
  return [status, controller] as const;
}
