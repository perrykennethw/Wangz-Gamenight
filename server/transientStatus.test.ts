import assert from "node:assert/strict";
import {
  createTransientStatusController,
  type StatusScheduler,
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

console.log(
  "Transient statuses cancel stale resets and ignore superseded or unmounted async results.",
);
