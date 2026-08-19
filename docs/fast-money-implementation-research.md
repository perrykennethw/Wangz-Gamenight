# Fast Money implementation recommendation for Wangz Game Night

Research date: 2026-08-18. This brief supports [GitHub issue #16](https://github.com/perrykennethw/Wangz-Gamenight/issues/16). External gameplay claims favor first-party or official sources. Product recommendations are labeled separately from sourced rules. The legal notes are risk-reduction guidance, not legal advice.

## Executive recommendation

Build Fast Money as a server-authoritative finale with exactly five questions, two ordered contestants, 20- and 25-second attempts, duplicate-answer protection for contestant two, and a 200-point combined goal.

For the first version:

1. Let members of the winning team vote for two contestants; let the host resolve ties, change either contestant, and set their order before confirming.
2. Default to answers entered on the active contestant's phone, with a host transcription fallback and host review before scores become final.
3. Reveal and score contestant one's attempt, then conceal their answer text while contestant two plays. After contestant two, reveal both columns one question at a time while the combined total climbs toward 200.
4. Detect repeats by stable answer identity and explicit aliases, not fuzzy text similarity. The host can mark or clear a repeat when human judgment is needed.
5. Keep the answer catalog, contestant-one responses, and unrevealed scores out of unauthorized snapshots. A waiting contestant-two device should show only an isolation screen until their attempt begins.
6. Import the alternate `final_round` and `final_round_timers` fields that the repository currently discards, while adding an equivalent canonical game-pack representation.

The most important prerequisite is moving the Feud finale into server state. The current regular Feud board and score live in the host's React component, which cannot securely isolate contestant two or recover the final round after a host refresh.

## Source-backed facts

The clearest formal primary source located is Section 43 of the [official Family Feud Live stage-show rules](https://familyfeudlive.com/FFL_USA.pdf). The document expressly says the licensed stage show is based on, but not identical in every respect to, the television program, so it is a strong rules baseline rather than a definitive television-production specification.

| Topic | What the official rules establish | Product consequence |
|---|---|---|
| Players | Two contestants play together as one team, and each has one attempt. | Require two distinct, ordered participant IDs. Do not silently let one person fill both positions. |
| Isolation | Contestant two is sent offstage with music-playing headphones so they cannot hear contestant one's attempt. | Redact contestant-one questions and responses from contestant two's client. The host must still arrange physical isolation from the shared display in an in-person room. |
| Questions | Each contestant receives the same five survey questions. | A valid Fast Money pack needs exactly five questions in a stable order. |
| Timers | Contestant one gets 20 seconds; contestant two gets 25 seconds. | Use 20/25 as the defaults and drive both from server deadlines. |
| Passing | A contestant may pass. If time remains, the host returns to passed questions. | Maintain a pass queue and revisit it in original question order. |
| Scoring | Each response earns the number of survey respondents who gave it. The live rules require at least two respondents for a valid scored answer. | Match a response to a configured answer bucket, then award that bucket's explicit point value. Unmatched responses score zero. |
| First reveal | Contestant one's answers are tallied, then hidden before contestant two returns. | Permit a first-attempt reveal, retain the subtotal, and conceal answer text before contestant two is admitted. |
| Repeats | Contestant two may not duplicate contestant one's response. A buzz prompts another response or a pass. | A rejected repeat must not advance the question; the timer continues and the repeat sound is supplementary feedback. |
| Goal | A combined score of at least 200 wins; below 200 receives the lower outcome. | Keep a visible `200` target and derive completion from the combined locked score. |
| Host error | The producer may add time when the host stumbles while reading. | Give the host a controlled add-time/correction action rather than making deadlines irreversible. |

The official Family Feud site also describes a first-party-branded mobile adaptation in which two players' Fast Money scores combine for a bonus over 200. That page is [promotional, not a formal rules specification](https://www.familyfeud.com/shop_play/mobile-game/). An official Family Feud announcement identifies Arkadium's browser game as a Fremantle partnership; Arkadium's own support material shows that a licensed digital version adapts the format to typed responses and a different scoring goal ([Family Feud announcement](https://www.familyfeud.com/2020/12/13/arkadium/), [Arkadium support](https://support.arkadium.com/en/support/solutions/articles/44002366581--family-feud-how-to-play-question-reports-scoring-using-gems-multiplayer)). This is useful evidence that phone entry is a reasonable digital adaptation, but its altered rules should not replace the 20/25-second, two-contestant, 200-point baseline above.

The official rules do **not** define team voting, automatic text normalization, fuzzy matching, host undo behavior, reconnect handling, a web privacy model, humorous messages, or the exact animation order of a paired final reveal. Those are Wangz product decisions.

## Recommended v1 decisions

### Eligibility, selection, and order

- The eligible team is the recorded winner of the main game. Until the main game has a server-authoritative winner, require the host to choose the eligible team explicitly and record that override.
- Each connected member of that team may vote for up to two distinct teammates. The two highest totals become the proposed pair; the host resolves ties and may override either choice.
- The host sets contestant one and contestant two before confirming. Show both names, avatars, and order to every room view.
- Require two distinct connected players. If the team has fewer than two, offer **Skip finale** or wait for another player; do not automatically reuse the same player.
- Lock the pair when the first timer begins. Replacement remains possible before an attempt or after a disconnect, but only through an explicit host action.

Team voting and winning-team eligibility come from issue #16's desired experience, not the stage-show source, whose promotion selects separate Fast Money contestants.

### Content and game-pack shape

Add an optional canonical section to `FeudGamePack`:

```ts
interface FeudFastMoneyPack {
  questions: [
    FastMoneyQuestion,
    FastMoneyQuestion,
    FastMoneyQuestion,
    FastMoneyQuestion,
    FastMoneyQuestion,
  ];
  timers?: { first: number; second: number }; // defaults: 20, 25
}

interface FastMoneyQuestion {
  id: string;
  prompt: string;
  answers: Array<{
    id: string;
    label: string;
    points: number;
    aliases?: string[];
  }>;
}
```

- Keep the goal fixed at 200 for v1.
- Validate exactly five questions, unique IDs, unique answer IDs per question, whole-number points, and normalized alias collisions.
- Treat the configured list as scoreable answer buckets, not as autocomplete data for contestants.
- Map the alternate importer's `final_round` tuple answers and `final_round_timers` into this structure. Today, [`src/feudGamePack.ts`](../src/feudGamePack.ts) adapts only regular `rounds`, and the [`README`](../README.md) says the final-round fields are ignored.
- Use literal author-created prompts and survey values. Do not bundle questions or answers copied from broadcasts, official apps, or official game products.

The canonical schema can keep timers configurable for house rules and accessibility, but setup should default to 20/25 and clearly identify nonstandard values. A conservative validation range such as 10–90 seconds avoids accidental zero or unbounded timers.

### Answer entry and adjudication

- The active contestant submits one response at a time from their phone. Provide a large text field, **Submit**, and **Pass**; keep focus in the field after each transition.
- Give the host a parallel **Record answer** fallback for spoken play. Both paths call the same server command, and the server accepts only the current question while the attempt is active.
- After an attempt ends, enter a host-only review phase. For each response, the host can edit the transcription, select the matching answer bucket, or mark it as no match. The configured point value follows the selected bucket.
- Never use unrestricted fuzzy matching to award points automatically. Normalize Unicode, case, whitespace, and ordinary punctuation; then match exact labels and pack-authored aliases. Fuzzy similarity may be shown privately as a host suggestion, never as an automatic score.
- Record host edits and provide one-step undo through the final reveal. A corrected revealed score should update the combined total immediately and be visibly marked as corrected on the moderator view.

### Duplicate handling

For contestant two, resolve repeats in this order:

1. If the submitted text normalizes to the exact text of contestant one's response for that question, reject it as a repeat.
2. If both responses resolve to the same configured answer ID or alias bucket, reject it as a repeat.
3. If the result is ambiguous, allow the host to mark it as a repeat during the live attempt or review.

A repeat rejection plays the existing repeat cue, announces “Try another answer” visually and accessibly, preserves the current question, and does not stop the clock. Do not send contestant one's actual response back in the error payload.

### Reveal and scoring flow

Use this host-controlled sequence:

1. Contestant one completes the five-question attempt.
2. The host reviews and locks the mappings and scores.
3. The presenter reveals contestant one's five rows and subtotal.
4. The host chooses **Hide first answers**; only the subtotal remains public, and contestant two can enter.
5. Contestant two completes the same questions, with immediate repeat protection.
6. The host reviews and locks contestant two's attempt.
7. The presenter reveals each question row on host command, showing both responses and points, while a combined meter advances toward 200.
8. The final screen announces the result with original Wangz copy and no claim of a real prize.

Steps 1–5 follow the sourced order. The paired row-by-row final reveal is a product recommendation: the formal rules require scoring after each attempt but do not prescribe this animation.

### Timers, correction, and reconnects

- Use a dedicated Fast Money timer in the game state rather than the generic shared timer. The current shared presets omit 20 seconds and do not encode question progression or contestant authorization.
- Store server timestamps and remaining time: `startedAt`, `deadline`, `status`, and `remainingMs` when paused. Clients render a countdown from that state; client clocks never decide whether an answer is timely.
- Accept a response only if the server receives it while the attempt is active and before the deadline. Late responses receive a neutral “Time is up” result and do not mutate state.
- Host controls: start, pause/resume, add five seconds, restart the current attempt after confirmation, and end early when all five questions are complete. Adding time is source-supported for a reading stumble; pause/restart are Wangz recovery tools.
- A disconnect does not silently restart the clock. The server keeps the deadline authoritative and alerts the host, who may continue, pause, add time, or replace the contestant. Reconnecting with the existing session ID restores only the viewer-authorized state.
- If the deadline passes while everyone is disconnected, the attempt moves to review with unanswered questions blank. Reconnect must not resurrect an expired attempt.

### Completion messages

Use a small set of original, non-monetary messages selected by outcome, for example:

- `200+`: “Two hundred! Bragging rights secured.”
- `<200`: “The board put up a fight. Rematch material.”

Keep the numeric result and win/loss label primary; humor should never obscure the score. Defer pack-authored or randomly generated prize copy until content moderation and localization needs are clearer.

## Server state and privacy model

### Suggested state machine

```text
selecting-contestants
  -> lineup-confirmed
  -> contestant-one-ready
  -> contestant-one-active
  -> contestant-one-review
  -> contestant-one-reveal
  -> contestant-two-ready
  -> contestant-two-active
  -> contestant-two-review
  -> final-reveal
  -> complete
```

State should include the eligible team, ordered contestant IDs, votes, current question/pass queue, both attempts, answer-bucket mappings, locked scores, timer, reveal cursor, combined score, and a bounded host-action history. Every transition and edit must be authorized and validated on the server.

### Viewer authorization

| Viewer | During contestant one | During contestant two | Review/reveal |
|---|---|---|---|
| Host | Full prompt, response, answer catalog, mapping tools, timer controls | Same, plus contestant-one responses | Full correction and reveal controls |
| Active contestant | Current prompt, own draft/response, timer, pass control | Same, without contestant-one data | Own locked responses after public reveal |
| Waiting contestant two | Isolation screen only; no prompts, responses, answer catalog, chat notifications, or presenter payload | Becomes active contestant | Public result only after reveal |
| Other participants | Public stage view; no answer catalog | Public stage view; no answer catalog | Revealed rows and combined score |
| Presenter | Explicit public presentation DTO only | Explicit public presentation DTO only | Only rows the host has revealed |

During either timed attempt, lock the eligible team's chat and hide chat notifications from both selected contestants. Otherwise a teammate could send hints through a channel that is already part of `RoomSnapshot`.

Redaction must happen when the server constructs each viewer's snapshot, not by hiding DOM elements. In particular:

- Never serialize the Fast Money answer catalog to player clients.
- Never serialize contestant-one prompts or responses to contestant two before their attempt is locked.
- Do not put secrets in generic error messages, typing events, analytics, logs, or presenter `BroadcastChannel` state.
- Revalidate permissions on every command; a modified client must not be able to submit for another contestant, reveal a row, change a score, or start a timer.

The current Feud setup already omits the full pack from player configuration in [`server/index.ts`](../server/index.ts), which is a useful foundation. However, regular Feud board state and scoring remain host-local in [`src/App.tsx`](../src/App.tsx), while `RoomSnapshot.game` currently models only Spin & Solve in [`src/roomTypes.ts`](../src/roomTypes.ts). Fast Money should introduce a server-owned Feud game/finale view with viewer-specific redaction rather than extend the host-local component.

## Edge cases to specify and test

- The winning team has fewer than two connected players: block selection and allow the host to skip the finale.
- A selection vote ties: host chooses; no random tie-break in v1.
- A selected contestant disconnects before their attempt: host replaces them or waits.
- A selected contestant disconnects during their attempt: clock continues until the host explicitly pauses or adjusts it.
- A contestant passes multiple questions: revisit each once in original order, continuing until time expires or all are answered.
- Time expires with a draft not submitted: do not score the draft.
- Contestant two repeats an answer at the deadline: the repeat receives no score and the question remains unanswered.
- Two phrases are synonyms: only a shared configured answer ID/alias or host ruling makes them equivalent.
- Contestant one's score reaches 200 alone: still run contestant two's attempt because the sourced format gives each contestant a turn.
- Host corrects a score after the result crosses 200 in either direction: recompute the outcome rather than preserving the earlier celebration.
- Host refreshes or presenter opens late: rebuild the exact current public view from server state.
- Contestant two reconnects during contestant one's reveal: they must still receive the isolation view.
- A command is retried after a network timeout: include command IDs and make submissions idempotent so an answer cannot advance two questions.

## Recommended verification

- Pure transition tests for selection, ordered contestants, pass queues, deadlines, early completion, review, reveal, scoring, correction, and completion.
- Duplicate tests for case, punctuation, whitespace, Unicode normalization, aliases, distinct answer buckets, and host overrides.
- Authorization tests in which every non-host role attempts host actions and each non-active player attempts contestant actions.
- Snapshot tests for host, contestant one, isolated contestant two, ordinary teammate, opposing team, reconnecting players, and presenter at every phase.
- Integration tests for disconnect before/during an attempt, expiry during disconnect, idempotent retries, late presenter connection, and correction across the 200-point boundary.
- Browser tests for keyboard-only answer entry, focus after submit/pass/repeat, screen-reader timer and repeat announcements, reduced-motion reveals, and no information flash during phase changes.

## Open questions after research

These do not block the recommended v1 defaults, but product owners should confirm them before implementation:

1. Should nonstandard timer values be editable in the builder, or only imported from `final_round_timers`?
2. Should ordinary spectators see each response live, or only after each attempt? Contestant two must remain isolated either way.
3. Is **Skip finale** enough when a winning team has only one connected player, or should the host be allowed to invite a substitute from the other team?
4. Should contestant voting remain private until the pair is confirmed, or should running totals be visible to the eligible team?
5. Is one-step undo sufficient, or should the host have a full adjudication history?

## Legally safer implementation boundary

The U.S. Copyright Office says a game's ideas, title, and methods of play are not protected by copyright, while expressive rule text and game artwork may be protected ([Copyright Office game guidance](https://www.copyright.gov/register/tx-games.html)). Family Feud's own terms restrict copying or reusing site text, images, audio, video, logos, trademarks, and data without permission ([Family Feud terms](https://www.familyfeud.com/terms/)).

Accordingly:

- Implement the mechanics in original code and original explanatory copy; do not copy official rule prose.
- Use original questions, survey data, board art, animations, sound effects, music, and completion messages, or content for which the project has explicit rights.
- Do not scrape or bundle question/answer banks from the show, official clips, apps, or board games.
- Treat host-imported content as user-provided content and document that uploaders must have the right to use it.
- For a public or monetized release, consider an original product-facing name for the finale and seek trademark/licensing advice before using official branding or implying affiliation.

## Sources

- [Family Feud Live official rules, especially Section 43](https://familyfeudlive.com/FFL_USA.pdf) — formal rules for the licensed 2014 stage-show promotion; expressly not identical in all respects to the television program.
- [Family Feud: Play Family Feud Live](https://www.familyfeud.com/shop_play/mobile-game/) — first-party promotional description of an adapted mobile Fast Money mode and the combined 200-point goal.
- [Family Feud announces its Arkadium partnership](https://www.familyfeud.com/2020/12/13/arkadium/) — first-party confirmation of the licensed browser adaptation.
- [Arkadium Family Feud support](https://support.arkadium.com/en/support/solutions/articles/44002366581--family-feud-how-to-play-question-reports-scoring-using-gems-multiplayer) — first-party vendor documentation for a typed, materially adapted digital implementation.
- [Official Family Feud 200-point compilation](https://www.youtube.com/watch?v=qPB6sdDiqoo) — promotional video from the verified Family Feud channel, useful as visual reference rather than a formal specification.
- [U.S. Copyright Office: Games](https://www.copyright.gov/register/tx-games.html) — official distinction between game methods and protectable expression.
- [Family Feud terms of use](https://www.familyfeud.com/terms/) — first-party restrictions on reuse of site content and marks.
