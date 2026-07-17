# Triads Frontend

The Angular/Ionic client for the Triads word-association game. This glossary captures terms specific to the daily-puzzle and game-entry flow.

## Language

**Daily Rollover**:
The moment the Eastern-time calendar day changes, making a new daily puzzle available and the previously loaded one stale.
_Avoid_: Midnight refresh, daily reset

**Brain-Warming Intro**:
The deliberate animated entry ritual (the warmup + confetti Play button) that precedes a daily game. It lives only on the home page; entering a daily puzzle is expected to pass through it.
_Avoid_: Welcome, loading screen

**Stale Tab / Re-entry**:
A daily game left open in a backgrounded tab across a rollover, then returned to via focus or visibility change. Re-entry — not the live midnight timer — is what triggers sending the player home.
_Avoid_: Idle tab, refresh

**Load-time Eastern Date**:
The Eastern calendar date recorded whenever the daily view loads any content (playable puzzle, no-schedule, error, or completed result). On re-entry, comparing today's Eastern date against this anchor determines whether the view is stale. Subsumes a loaded puzzle's `puzzleDate` as the single staleness anchor.
_Avoid_: Loaded date, snapshot date

**Score Share Image**:
The shareable picture a player copies or sends from the daily result screen. It carries the player's score and, in the top-right corner, the Puzzle-Date Badge identifying which day's puzzle the score belongs to. Only daily games produce one.
_Avoid_: Score card, result screenshot

**Puzzle-Date Badge**:
The tear-off-calendar element overlaid on the Score Share Image showing the puzzle's date (month, day, year). It is anchored to the puzzle's own date — not the moment of sharing — so a score always names the puzzle it came from.
_Avoid_: Date stamp, calendar icon

**Solution Reveal**:
The cards shown after a lost game that disclose the unsolved triads and their matching phrases.
_Avoid_: Answer cards, solution boxes

**Eastern Day Watcher**:
The shared service mechanism that detects rollover. It exposes two distinct signals: a live midnight-timer rollover and a re-entry (focus/visibility) rollover, so consumers can react to each independently.
_Avoid_: Day timer, midnight watcher

**Classic Extra**:
A Classic game a player may start _after_ finishing today's Daily, capped at a small daily allowance and reset by the Daily Rollover. Locked until today's Daily is completed.
_Avoid_: Bonus game, extra game, play more

**Standalone Classic**:
The independently hosted Classic edition, available without completing the Daily and without a daily play quota. Its player profile and score history are separate because the browser origin is separate.
_Avoid_: Classic Extra, unlimited extra

**Play-More Prompt**:
The post-Daily invitation to start another Classic Extra, showing how many of the day's allowance remain. Appears both on the home screen and after a Classic Extra ends.
_Avoid_: Play again screen, second-game page
