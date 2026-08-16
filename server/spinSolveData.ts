export interface SpinSolvePuzzle {
  id: string
  category: string
  solution: string
}

export const regularPuzzles: readonly SpinSolvePuzzle[] = [
  { id: 'phrase-quiet', category: 'Phrase', solution: 'KEEP IT UNDER YOUR HAT' },
  { id: 'food-toast', category: 'Food & Drink', solution: 'AVOCADO TOAST WITH CHILI FLAKES' },
  { id: 'doing-dance', category: 'What Are You Doing?', solution: 'DANCING IN THE KITCHEN' },
  { id: 'place-rooftop', category: 'Place', solution: 'A ROOFTOP GARDEN' },
  { id: 'thing-blanket', category: 'Thing', solution: 'AN EXTRA COZY BLANKET' },
  { id: 'event-brunch', category: 'Event', solution: 'A LONG SUNDAY BRUNCH' },
  { id: 'before-board', category: 'Before & After', solution: 'BOARD GAME NIGHT OWL' },
  { id: 'phrase-shoes', category: 'Phrase', solution: 'PUT YOUR BEST FOOT FORWARD' },
  { id: 'food-pancakes', category: 'Food & Drink', solution: 'BLUEBERRY PANCAKES' },
  { id: 'doing-roadtrip', category: 'What Are You Doing?', solution: 'MAKING A ROAD TRIP PLAYLIST' },
  { id: 'place-bookshop', category: 'Place', solution: 'THE CORNER BOOKSHOP' },
  { id: 'thing-speaker', category: 'Thing', solution: 'A PORTABLE SPEAKER' },
]

export const bonusPuzzles: readonly SpinSolvePuzzle[] = [
  { id: 'bonus-phrase', category: 'Phrase', solution: 'QUICK ON YOUR FEET' },
  { id: 'bonus-thing', category: 'Thing', solution: 'WOVEN PICNIC BASKET' },
  { id: 'bonus-place', category: 'Place', solution: 'QUIET MOUNTAIN CABIN' },
  { id: 'bonus-doing', category: 'What Are You Doing?', solution: 'PACKING FOR THE WEEKEND' },
]
