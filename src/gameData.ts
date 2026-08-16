export type Answer = readonly [label: string, points: number]

export interface FeudQuestion {
  prompt: string
  answers: readonly Answer[]
}

export const questions: readonly FeudQuestion[] = [
  {
    prompt: 'Name something people do right before guests arrive.',
    answers: [
      ['Clean the house', 34],
      ['Hide the clutter', 21],
      ['Start cooking', 16],
      ['Get dressed', 12],
      ['Light a candle', 9],
      ['Check the door', 8],
    ],
  },
  {
    prompt: 'Name something that always seems to disappear at a party.',
    answers: [
      ['Ice', 31],
      ['Chips', 24],
      ['Cups', 17],
      ['The bottle opener', 12],
      ['Phone chargers', 9],
      ['Someone’s jacket', 7],
    ],
  },
  {
    prompt: 'Name a reason someone might be late to game night.',
    answers: [
      ['Traffic', 38],
      ['Couldn’t find parking', 19],
      ['Lost track of time', 15],
      ['Had to get snacks', 12],
      ['Wrong address', 9],
      ['Still getting ready', 7],
    ],
  },
  {
    prompt: 'Name something people get competitive about for no reason.',
    answers: [
      ['Board games', 29],
      ['Parking spots', 21],
      ['Trivia', 18],
      ['Who pays the bill', 13],
      ['Cooking', 11],
      ['Steps on a fitness app', 8],
    ],
  },
  {
    prompt: 'Name something you would hate to run out of during a road trip.',
    answers: [
      ['Gas', 39],
      ['Snacks', 20],
      ['Phone battery', 16],
      ['Water', 12],
      ['Music', 7],
      ['Patience', 6],
    ],
  },
  {
    prompt: 'Name a food that is impossible to eat quietly.',
    answers: [
      ['Chips', 35],
      ['Popcorn', 22],
      ['Carrots', 17],
      ['Apples', 11],
      ['Tacos', 9],
      ['Cereal', 6],
    ],
  },
  {
    prompt: 'Name something friends argue about when choosing a movie.',
    answers: [
      ['The genre', 33],
      ['Who picks', 23],
      ['Too scary', 15],
      ['Too long', 12],
      ['Seen it already', 10],
      ['Subtitles', 7],
    ],
  },
  {
    prompt: 'Name something that makes a group chat go silent.',
    answers: [
      ['Asking for plans', 28],
      ['Splitting the bill', 22],
      ['An awkward message', 18],
      ['A very long story', 13],
      ['A work question', 11],
      ['It’s too late at night', 8],
    ],
  },
]

export const multiplierForRound = (round: number): number => {
  if (round >= 4) return 3
  if (round === 3) return 2
  return 1
}
