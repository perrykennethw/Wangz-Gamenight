import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRESENTER_WRONG_ANSWER_CUE_DURATION_MS,
  PresenterWrongAnswerCue,
} from "../src/PresenterWrongAnswerCue";

let root: Root | null = null;

async function renderCue(revision: number): Promise<void> {
  await act(async () => {
    root?.render(<PresenterWrongAnswerCue revision={revision} />);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.querySelector("#root")!);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.useRealTimers();
});

describe("presenter wrong-answer cue", () => {
  it("ignores initial and stale revisions, then displays each new cue once", async () => {
    await renderCue(4);
    expect(document.querySelector(".presenter-wrong-answer-cue")).toBeNull();

    await renderCue(5);
    expect(document.querySelector('[role="status"]')?.textContent).toContain("Wrong answer");

    await act(async () => {
      vi.advanceTimersByTime(PRESENTER_WRONG_ANSWER_CUE_DURATION_MS);
    });
    expect(document.querySelector(".presenter-wrong-answer-cue")).toBeNull();

    await renderCue(5);
    expect(document.querySelector(".presenter-wrong-answer-cue")).toBeNull();
    await renderCue(2);
    expect(document.querySelector(".presenter-wrong-answer-cue")).toBeNull();
    await renderCue(3);
    expect(document.querySelector(".presenter-wrong-answer-cue")).not.toBeNull();
  });

  it("restarts the dismissal timer when strikes arrive quickly", async () => {
    await renderCue(0);
    await renderCue(1);
    await act(async () => {
      vi.advanceTimersByTime(PRESENTER_WRONG_ANSWER_CUE_DURATION_MS - 100);
    });

    await renderCue(2);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(document.querySelector(".presenter-wrong-answer-cue")).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(PRESENTER_WRONG_ANSWER_CUE_DURATION_MS - 100);
    });
    expect(document.querySelector(".presenter-wrong-answer-cue")).toBeNull();
  });
});
