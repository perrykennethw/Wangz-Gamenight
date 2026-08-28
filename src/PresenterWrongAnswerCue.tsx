import { useEffect, useRef, useState } from "react";

export const PRESENTER_WRONG_ANSWER_CUE_DURATION_MS = 900;

export function PresenterWrongAnswerCue({ revision }: { revision: number }) {
  const previousRevision = useRef(revision);
  const [activeRevision, setActiveRevision] = useState<number | null>(null);

  useEffect(() => {
    const shouldShow = revision > previousRevision.current;
    previousRevision.current = revision;

    if (!shouldShow) {
      setActiveRevision(null);
      return;
    }

    setActiveRevision(revision);
    const timeout = window.setTimeout(
      () => setActiveRevision(null),
      PRESENTER_WRONG_ANSWER_CUE_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [revision]);

  if (activeRevision === null) return null;

  return (
    <aside
      key={activeRevision}
      className="presenter-wrong-answer-cue"
      role="status"
      aria-live="assertive"
    >
      <span className="sr-only">Wrong answer</span>
      <div className="presenter-wrong-answer-cue__mark" aria-hidden="true">
        <b>×</b>
        <small>Strike</small>
      </div>
    </aside>
  );
}
