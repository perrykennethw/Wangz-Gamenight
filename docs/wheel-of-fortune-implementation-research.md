# Spin-and-solve implementation recommendation for Wangz Game Night

Research date: 2026-08-16. External gameplay claims use official Wheel of Fortune, Sony, Ubisoft, Hasbro, U.S. Copyright Office, and USPTO sources. This is product and engineering research, not legal advice.

## Executive recommendation

Build the next game as an original-branded **spin-and-solve** mode for **two teams**, optimized for one shared host screen and players' phones:

1. Three regular puzzle rounds.
2. The team with the highest banked total enters a leader-only bonus round.
3. Regular wheels contain cash wedges plus Bankrupt and Lose a Turn.
4. On each turn, the active team chooses **Spin**, **Buy a vowel**, or **Solve**.
5. Defer toss-ups, speed-up/final-spin play, prize collectibles, Express, Mystery, Wild Card, and other specialty wedges until the basic loop has proven fun.

This captures the recognizable interaction set that Sony itself describes—spin, buy a vowel, guess letters, reveal them, and solve—while staying short enough for a living-room game night ([Sony's official game](https://www.sonypictures.com/games/wheeloffortuneofficialgame)). Licensed implementations already adapt the show: Ubisoft documents five round types, while Hasbro's home format compresses play into a tabletop game. Exact broadcast replication is therefore neither necessary nor desirable for this app ([Ubisoft game manual](https://dlassets-ssl.xboxlive.com/public/content/90ba4562-ec6e-4a57-b0ef-2293c0fa69a4/GameManual/0a778b31-be6a-4000-bf5d-c6d51c438c37/en-US/index.html), [Hasbro home-game rules](https://www.hasbro.com/common/instruct/wheel_of_fortune_rules_and_letter_guide.pdf)).

## MVP rules

### Game and round flow

- Start each regular round with a category and a concealed multi-word puzzle.
- Alternate which team receives first control in rounds one through three. A future toss-up can replace this deterministic start.
- A team turn begins with one of three actions: spin, buy a vowel for 250 round points, or attempt a solve. Official live rules use this same choice structure and treat Y as a consonant ([Wheel of Fortune LIVE rules](https://www.wheeloffortunelive.com/rules)).
- A cash-wedge consonant earns `wedge value × occurrences`. A correct consonant or vowel retains control.
- Control passes after an absent or previously used letter, Lose a Turn, Bankrupt, or an incorrect solve. Reject unaffordable or out-of-phase app commands without changing state so an accidental tap is not treated as a gameplay decision. When only vowels remain, disable spinning and require buying a vowel or solving. The turn-loss and only-vowels rules follow the documented live game; rejecting malformed commands is an app-specific usability choice ([Wheel of Fortune LIVE rules](https://www.wheeloffortunelive.com/rules)).
- Bankrupt clears only that team's unbanked points and held round items; it does not erase earlier banked rounds. Solving banks the round total. Licensed Ubisoft rules likewise say Bankrupt removes cash and collectibles acquired in the current round, whereas Lose a Turn only skips the turn ([Ubisoft game manual](https://dlassets-ssl.xboxlive.com/public/content/90ba4562-ec6e-4a57-b0ef-2293c0fa69a4/GameManual/0a778b31-be6a-4000-bf5d-c6d51c438c37/en-US/index.html)).
- Only the solving team banks its round earnings, matching the official live rules ([Wheel of Fortune LIVE rules](https://www.wheeloffortunelive.com/rules)). For this app, play three rounds and advance the highest banked total to the bonus round; the round count is a product choice to keep a game-night session compact.
- Define a house tie-breaker explicitly: one sudden-death toss-up, or—if toss-ups remain out of MVP—a host-triggered coin flip for bonus-round entry. The sudden-death puzzle is the better eventual experience.

Use points rather than representing scores as redeemable money or real prizes. Suggested MVP wheel values are `300, 350, 400, 450, 500, 550, 600, 650, 700, 800`, repeated across a 24-segment wheel with two Bankrupts and one Lose a Turn. This distribution is a product choice, not a claim about the television wheel; keep it in configurable data so play-testing can tune pace.

### Bonus round

The leading team should nominate one solver. Offer three categories, reveal `R S T L N E`, let the solver choose three additional consonants and one vowel, reveal all matches, then start a 10-second solve timer. Permit multiple spoken solve attempts before time expires. This matches the official live format ([Wheel of Fortune LIVE rules](https://www.wheeloffortunelive.com/rules)); licensed Hasbro electronic rules independently document the `RSTLNE + 3 consonants + 1 vowel` structure ([Hasbro electronic-game rules](https://www.hasbro.com/common/instruct/Wheel_of_Fortune_Classic.pdf)).

For this app, winning the bonus should award a fixed bonus or cosmetic celebration, not determine the main-game winner. The leading team already won the competitive game; the bonus is a finale. A default `5,000` bonus points is easy to understand and avoids pretending to award cash.

### Puzzle content and categories

Start with original puzzles in familiar semantic categories:

- Thing
- Person
- Place
- Phrase
- What Are You Doing?
- Food & Drink
- Event
- Title
- Song / Artist
- Before & After

The official live rules explicitly use categories such as Person, Place, and Thing and allow producers to add more; the official site currently uses Food and Drink, and show materials demonstrate Before & After ([live rules](https://www.wheeloffortunelive.com/rules), [official Bonus Puzzle](https://www.wheeloffortune.com/play/bonus-puzzle), [official contestant feature](https://www.wheeloffortune.com/contestant-blog/ronnie-l)). Store the display category separately from solution text and optional host notes. Normalize guesses for case, repeated spaces, and ordinary punctuation, but do not silently accept misspellings; provide the host an override for speech ambiguity.

Do not copy broadcast or official-app puzzle banks. Author an original, reviewed corpus and track stable puzzle IDs, category, solution, difficulty, word/line layout, source/author, and `usedAt` history. Avoid proper nouns likely to become stale unless they are intentionally curated.

## Host and player experience

The current application establishes the right room pattern: a visible host screen, a five-character room code, players assigned to two teams, and private team chat. Wheel play should extend that division of responsibilities rather than put every control on the host.

| Surface | Responsibility |
|---|---|
| Shared host display | Puzzle board, category, wheel animation, used-letter board, active team, both banked scores, current round balances, timer, and large adjudication/undo controls. Keep the unrevealed solution hidden from the ordinary display. |
| Active team's phones | Spin button, consonant/vowel selection, buy-vowel action, and solve submission. Only the active team can send game actions. One nominated captain can submit, or use first-valid-input-wins with a visible lock. |
| Inactive team's phones | Read-only board and scores plus private team chat; no actionable letter keyboard. |
| Host controls | Accept/reject or override a solve, correct a mistaken letter, undo the last atomic action, pause/resume timers, skip a broken puzzle, transfer control, and advance rounds. |

For a lively room, the server should choose the wheel result first and broadcast a deterministic animation target to every screen; animation must never decide the result independently. Keep spoken discussion social, but require letter and solve submissions through the app so duplicate-letter, turn, and scoring rules remain enforceable. Treat solve text as secret: show it only to the server and host until judged, not to the opposing team or shared display.

Accessibility requirements should include a reduced-motion wheel, non-color status cues, high-contrast letter tiles, keyboard operation on the host screen, screen-reader announcements for revealed letters and control changes, and sound that supplements rather than carries game state.

## Repository fit and required architecture

The repository currently labels Wheel of Fortune as “In the works” but is structurally Feud-specific:

- [`src/App.tsx`](../src/App.tsx) has a single Feud setup path and keeps round, revealed-answer, strike, score, and winner state entirely inside the host's `Game` component.
- [`src/gameData.ts`](../src/gameData.ts) contains only Feud questions and scoring multipliers.
- [`src/roomTypes.ts`](../src/roomTypes.ts) gives `GameConfig` Feud-only team/winning-score fields, and `RoomSnapshot` carries lobby, participants, and chat but no authoritative game state or game kind.
- [`server/index.ts`](../server/index.ts) is authoritative for rooms, team selection, and private chat, but after `game:start` it changes only the room phase. Player screens therefore cannot currently submit or observe synchronized gameplay actions.

Do not add Wheel as a second large host-local module. Introduce a game seam before implementing it:

```ts
type GameConfig =
  | { kind: 'feud'; teamOne: string; teamTwo: string; winningScore: number }
  | { kind: 'spin-solve'; teamOne: string; teamTwo: string; rounds: number }
```

Add a server-authoritative, pure spin-and-solve state machine with explicit phases such as `round-intro`, `awaiting-action`, `spinning`, `choosing-letter`, `judging-solve`, `round-complete`, `bonus-letters`, `bonus-solving`, and `game-complete`. Its state should include active team, wheel result, guessed letters, puzzle ID/solution, public mask, per-team unbanked totals, banked totals, deadlines, and a short action history for undo.

Keep the rules module deep: callers should not reproduce turn, scoring, redaction, or timing rules. A small interface is enough:

```ts
createGame(config, dependencies): GameState
applyGameCommand(state, actor, command): CommandResult
viewGameFor(state, viewer): GameView
```

Inject the clock and random-number source through `dependencies`; tests and production then exercise the same interface with deterministic and cryptographic adapters respectively.

The server should validate every command against phase, role/team, active turn, affordability, and duplicate-letter state, then emit **redacted viewer-specific game views**. Never include the raw solution in player or shared-display snapshots before the puzzle ends. Generate randomness on the server with an injectable RNG, persist the chosen wedge index, and make repeated command IDs idempotent.

## Phased engineering plan

### Phase 1: Establish the multi-game seam

- Add discriminated game configs and routes from the game cabinet.
- Move Feud behind the same game-kind interface without changing its behavior.
- Extend room snapshots/events with per-viewer game state and authorization.
- Create pure state transitions and server-side command handling before UI animation.

### Phase 2: Ship the core spin-and-solve MVP

- Add an original puzzle pack and board-layout validation.
- Implement three rounds, cash wedges, Bankrupt, Lose a Turn, consonants, 250-point vowels, solve adjudication, banking, tie handling, and bonus play.
- Build host board/controls and active/inactive phone states.
- Add deterministic wheel animation, timers, host override, skip, and single-step undo.

### Phase 3: Harden and tune

- Add reconnect/resume tokens and restore active games after transient socket loss.
- Tune wheel values, puzzle difficulty, timers, and round count from real game-night observation.
- Add content tooling and puzzle-history avoidance.
- Add accessibility and privacy checks to CI.

### Phase 4: Optional show-like features

- Toss-up and sudden-death buzzers.
- Speed-up/final spin: the official live version adds 1,000 to a selected cash value, removes further spins, gives free vowels/no vowel points, and allows three seconds to solve after a present letter ([Wheel of Fortune LIVE rules](https://www.wheeloffortunelive.com/rules)).
- Express and collectible/special wedges. Ubisoft documents Free Play, Mystery, Express, Wild Card, Prize, and other licensed variants; each adds state and exception rules that are unnecessary for MVP ([Ubisoft game manual](https://dlassets-ssl.xboxlive.com/public/content/90ba4562-ec6e-4a57-b0ef-2293c0fa69a4/GameManual/0a778b31-be6a-4000-bf5d-c6d51c438c37/en-US/index.html)).
- Configurable team sizes, round presets, and user-authored puzzle packs.

## Verification plan

Test the rules engine primarily as deterministic state transitions:

- cash × occurrences, vowel debit, no vowel award, and round banking;
- Bankrupt clears current-round assets only; Lose a Turn preserves them;
- missing/repeated letters and incorrect solves pass control;
- correct letters retain control and reveal every matching position;
- invalid phase, inactive team, unauthorized player, and duplicate command rejection;
- only-vowels-left disables spin;
- tie-break, end-of-round, leader selection, bonus letters, timer, and completion;
- seeded wheel outcomes and reconnect replay produce identical views;
- unrevealed solutions and opposing solve submissions never appear in player snapshots;
- undo restores the exact prior state without double-awarding points.

Add server integration tests with two teams and a host to verify redaction and turn authorization, then browser-level tests for keyboard focus, reduced motion, timer pause/resume, and reconnect behavior.

## Name, artwork, and IP boundary

`Wheel of Fortune®` and `America's Game®` are registered trademarks of Califon Productions, Inc., as the official site and Sony's official-game page state ([official site](https://www.wheeloffortune.com/), [Sony official game](https://www.sonypictures.com/games/wheeloffortuneofficialgame)). The U.S. Copyright Office says a game's idea, title, and methods of play are not protected by copyright, but expressive rule text and graphic/artistic material may be ([Copyright Office games guidance](https://www.copyright.gov/register/tx-games.html)). The USPTO explains that unauthorized trademark use can infringe where it is likely to confuse consumers about source or sponsorship ([USPTO infringement overview](https://www.uspto.gov/page/about-trademark-infringement), [likelihood of confusion](https://www.uspto.gov/trademarks/search/likelihood-confusion)).

Accordingly, private/noncommercial use does **not** grant permission to copy the official logo, puzzle-board or wheel artwork, type treatment, music, sound effects, clips, screenshots, host likenesses, show copy, or official puzzle database. Sony's Terms restrict copying, modifying, reproducing, publishing, displaying, distributing, and making derivative use of its service content without permission ([Sony Terms of Use](https://www.sonypictures.com/sites/default/files/2020-04/TermsofUseISG20200420.pdf)).

The lowest-risk product direction is an original name, logo, palette, wheel and tile design, sounds, host copy, and puzzle bank, with no claim of Sony or Califon affiliation. “Spin-and-solve” can describe the mechanic internally; choose and clear a distinctive public name before release. Seek licensing advice before public, branded, or monetized distribution. Sony provides a formats contact for licensing inquiries, while its corporate FAQ gives a separate contact for clips and stills ([Sony Formats](https://formats.sonypictures.com/contactus), [Sony FAQ](https://www.sonypictures.com/corp/help.html)).

## Decision summary

The strongest first release is **two teams, three regular rounds, a simple risk/reward wheel, and a 10-second bonus finale**, with player phones submitting actions and the shared host display presenting the show. The most important engineering prerequisite is not wheel animation; it is moving gameplay into a server-authoritative, viewer-redacted game state model that can support both Feud and future games cleanly.
