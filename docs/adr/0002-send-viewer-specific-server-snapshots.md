# Send viewer-specific server snapshots

The server owns room mutations and creates a separate snapshot for each connected viewer instead of broadcasting one complete state and hiding fields in React. The extra projection logic is accepted because authorization and redaction must prevent players from receiving other-team huddles, hidden game-pack data, private votes, or unrevealed Fast Money answers.
