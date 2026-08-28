# Wangz Game Night

Wangz Game Night is a host-led, synchronous game-night experience for a small group sharing one live event. This glossary defines the language used across product decisions, issues, and code reviews.

## Room and people

**Room**:
A temporary gathering identified by a room code that persists from team setup through one or more games.
_Avoid_: Session, lobby

**Lobby**:
The pre-game phase of a room where players join, choose teams, and prepare to play.
_Avoid_: Room

**Host**:
The person who creates the room, controls game flow, and moderates both teams.
_Avoid_: Moderator, admin

**Player**:
A person who joins the room, occupies a roster seat, and may act for a team.
_Avoid_: Participant, guest

**Waiting Player**:
A player who joins after a game starts and is waiting for the host to assign a team or for the next eligible question boundary.
_Avoid_: Spectator, pending participant, late joiner

**Player Identity**:
The display name and avatar associated with a player in a room.
_Avoid_: Account, profile

**Team**:
One of the room's two competing groups, each with its own roster and private huddle.
_Avoid_: Side, channel

**Room Code**:
The five-character invitation identifier used to find an active room.
_Avoid_: Password, access token

## Games and play

**Game**:
One playthrough of a selected ruleset inside a room; a room may host another game without replacing its players or teams.
_Avoid_: Room, match

**Game Pack**:
An authored Family Feud question set, including answer values and optional Fast Money material.
_Avoid_: Game data, question file

**Round**:
A scoring segment within a game that advances toward the game's final outcome.
_Avoid_: Game

**Face-off Representative**:
The selected player from each team who may buzz during a Family Feud face-off.
_Avoid_: Buzzer player

**Answering Order**:
The ordered rotation of a team's players during normal Family Feud play.
_Avoid_: Turn list, lineup

**Play/Pass Decision**:
The controlling choice made after a Family Feud face-off to answer the board or hand control to the other team.
_Avoid_: Vote

**Fast Money**:
The Family Feud finale in which two selected players answer the same five prompts in isolated attempts.
_Avoid_: Final round, separate game

## Shared experience

**Team Huddle**:
A private team conversation visible to that team and the host.
_Avoid_: Chat room, global chat

**Presenter Display**:
The audience-facing view of public room and game information, controlled by the host.
_Avoid_: Host screen, player screen

**Shared Timer**:
A room-wide countdown visible to the host, players, and presenter display without automatically changing game state.
_Avoid_: Turn timer, game clock
