import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { StrictMode, act, createElement, useEffect } from "react";
import {
  createTransientStatusController,
  type StatusScheduler,
  useTransientStatus,
} from "../src/transientStatus.js";

class ControlledScheduler implements StatusScheduler<number> {
  private nextHandle = 1;
  readonly callbacks = new Map<number, () => void>();
  readonly canceled = new Set<number>();

  schedule(callback: () => void): number {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.canceled.add(handle);
  }

  fire(handle: number): void {
    this.callbacks.get(handle)?.();
  }

  fireAll(): void {
    for (const callback of this.callbacks.values()) callback();
  }
}

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: () => void;
} {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = () => rejectPromise(new Error("clipboard unavailable"));
  });
  return { promise, resolve, reject };
}

function StrictLifecycleHarness({
  scheduler,
  operation,
}: {
  scheduler: ControlledScheduler;
  operation: () => Promise<void>;
}) {
  const [, presenterStatus] = useTransientStatus(scheduler);
  const [, clipboardStatus] = useTransientStatus(scheduler);

  useEffect(() => {
    presenterStatus.begin().show("Presenter tab opened.", 1800);
    void clipboardStatus.run(
      operation,
      "Room code copied!",
      "Could not copy. Select the room code instead.",
      1800,
    );
  }, [clipboardStatus, operation, presenterStatus]);

  return null;
}

{
  const scheduler = new ControlledScheduler();
  const statuses: string[] = [];
  const controller = createTransientStatusController(
    (status) => statuses.push(status),
    scheduler,
  );

  controller.begin().show("Presenter tab opened.", 1800);
  const firstReset = 1;
  controller.begin().show("Presenter tab opened again.", 1800);
  const secondReset = 2;

  assert.equal(scheduler.canceled.has(firstReset), true);
  scheduler.fire(firstReset);
  assert.deepEqual(statuses, [
    "Presenter tab opened.",
    "Presenter tab opened again.",
  ]);

  controller.cancel();
  assert.equal(scheduler.canceled.has(secondReset), true);
  scheduler.fire(secondReset);
  assert.deepEqual(statuses, [
    "Presenter tab opened.",
    "Presenter tab opened again.",
  ]);
}

{
  const scheduler = new ControlledScheduler();
  const statuses: string[] = [];
  const controller = createTransientStatusController(
    (status) => statuses.push(status),
    scheduler,
  );
  const olderCopy = deferred();
  const newerCopy = deferred();

  const olderResult = controller.run(
    () => olderCopy.promise,
    "Room code copied!",
    "Could not copy. Select the room code instead.",
    1800,
  );
  const newerResult = controller.run(
    () => newerCopy.promise,
    "Join link copied!",
    "Could not copy. Select the room code instead.",
    1800,
  );

  newerCopy.resolve();
  await newerResult;
  olderCopy.reject();
  await olderResult;

  assert.deepEqual(statuses, ["Join link copied!"]);
  scheduler.fire(1);
  assert.deepEqual(statuses, ["Join link copied!", ""]);
}

{
  const scheduler = new ControlledScheduler();
  const statuses: string[] = [];
  const controller = createTransientStatusController(
    (status) => statuses.push(status),
    scheduler,
  );
  const copy = deferred();

  controller.begin().show("Room code copied!", 1800);
  const resetHandle = 1;
  controller.cancel();
  assert.equal(scheduler.canceled.has(resetHandle), true);
  scheduler.fire(resetHandle);
  assert.deepEqual(statuses, ["Room code copied!"]);

  const result = controller.run(
    () => copy.promise,
    "Join link copied!",
    "Could not copy. Select the room code instead.",
    1800,
  );
  controller.cancel();
  copy.resolve();
  await result;
  assert.deepEqual(statuses, ["Room code copied!"]);
}

{
  const scheduler = new ControlledScheduler();
  const statuses: string[] = [];
  const controller = createTransientStatusController(
    (status) => statuses.push(status),
    scheduler,
  );

  await controller.run(
    () => Promise.reject(new Error("clipboard unavailable")),
    "Room code copied!",
    "Could not copy. Select the room code instead.",
    1800,
  );
  assert.deepEqual(statuses, ["Could not copy. Select the room code instead."]);
  scheduler.fire(1);
  assert.deepEqual(statuses, ["Could not copy. Select the room code instead.", ""]);
}

{
  const scheduler = new ControlledScheduler();
  const statuses: string[] = [];
  const controller = createTransientStatusController(
    (status) => statuses.push(status),
    scheduler,
  );

  controller.begin().show(
    "Your browser blocked the presenter tab. Allow pop-ups, then try again.",
  );
  assert.deepEqual(statuses, [
    "Your browser blocked the presenter tab. Allow pop-ups, then try again.",
  ]);
  assert.equal(scheduler.callbacks.size, 0);
}

{
  const testWindow = new Window({ url: "http://localhost/" });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: testWindow,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: testWindow.document,
  });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  });

  const { createRoot } = await import("react-dom/client");
  const container = testWindow.document.createElement("div");
  testWindow.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const scheduler = new ControlledScheduler();
  const copy = deferred();
  let operationStarts = 0;

  await act(async () => {
    root.render(createElement(
      StrictMode,
      null,
      createElement(StrictLifecycleHarness, {
        scheduler,
        operation: () => {
          operationStarts += 1;
          return copy.promise;
        },
      }),
    ));
  });

  assert.equal(operationStarts, 2, "Strict Mode should replay the mounted effect");
  assert.equal(scheduler.callbacks.size, 2);

  await act(async () => root.unmount());
  assert.deepEqual(
    [...scheduler.canceled],
    [...scheduler.callbacks.keys()],
    "Strict Mode replay and final unmount should cancel every reset timer",
  );

  const scheduledBeforeStaleWork = scheduler.callbacks.size;
  scheduler.fireAll();
  copy.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(
    scheduler.callbacks.size,
    scheduledBeforeStaleWork,
    "settling an operation after unmount should not schedule another reset",
  );

  testWindow.close();
}

console.log(
  "Transient statuses cancel stale resets and Strict Mode lifecycle work after unmount.",
);
