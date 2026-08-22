import type { FeudGamePack } from "./roomTypes";

export const starterFeudPack: FeudGamePack = {
  version: 1,
  kind: "feud",
  title: "Wangz Originals",
  questions: [
    {
      id: "guests-arrive",
      prompt: "Name something people do right before guests arrive.",
      answers: [
        { id: "clean-house", label: "Clean the house", points: 34 },
        { id: "hide-clutter", label: "Hide the clutter", points: 21 },
        { id: "start-cooking", label: "Start cooking", points: 16 },
        { id: "get-dressed", label: "Get dressed", points: 12 },
        { id: "light-candle", label: "Light a candle", points: 9 },
        { id: "check-door", label: "Check the door", points: 8 },
      ],
    },
    {
      id: "party-disappears",
      prompt: "Name something that always seems to disappear at a party.",
      answers: [
        { id: "ice", label: "Ice", points: 31 },
        { id: "chips", label: "Chips", points: 24 },
        { id: "cups", label: "Cups", points: 17 },
        { id: "bottle-opener", label: "The bottle opener", points: 12 },
        { id: "phone-chargers", label: "Phone chargers", points: 9 },
        { id: "jacket", label: "Someone’s jacket", points: 7 },
      ],
    },
    {
      id: "late-game-night",
      prompt: "Name a reason someone might be late to game night.",
      answers: [
        { id: "traffic", label: "Traffic", points: 38 },
        { id: "parking", label: "Couldn’t find parking", points: 19 },
        { id: "lost-time", label: "Lost track of time", points: 15 },
        { id: "snacks", label: "Had to get snacks", points: 12 },
        { id: "wrong-address", label: "Wrong address", points: 9 },
        { id: "getting-ready", label: "Still getting ready", points: 7 },
      ],
    },
    {
      id: "competitive",
      prompt: "Name something people get competitive about for no reason.",
      answers: [
        { id: "board-games", label: "Board games", points: 29 },
        { id: "parking-spots", label: "Parking spots", points: 21 },
        { id: "trivia", label: "Trivia", points: 18 },
        { id: "bill", label: "Who pays the bill", points: 13 },
        { id: "cooking", label: "Cooking", points: 11 },
        { id: "fitness-steps", label: "Steps on a fitness app", points: 8 },
      ],
    },
    {
      id: "road-trip",
      prompt: "Name something you would hate to run out of during a road trip.",
      answers: [
        { id: "gas", label: "Gas", points: 39 },
        { id: "road-snacks", label: "Snacks", points: 20 },
        { id: "battery", label: "Phone battery", points: 16 },
        { id: "water", label: "Water", points: 12 },
        { id: "music", label: "Music", points: 7 },
        { id: "patience", label: "Patience", points: 6 },
      ],
    },
    {
      id: "loud-food",
      prompt: "Name a food that is impossible to eat quietly.",
      answers: [
        { id: "loud-chips", label: "Chips", points: 35 },
        { id: "popcorn", label: "Popcorn", points: 22 },
        { id: "carrots", label: "Carrots", points: 17 },
        { id: "apples", label: "Apples", points: 11 },
        { id: "tacos", label: "Tacos", points: 9 },
        { id: "cereal", label: "Cereal", points: 6 },
      ],
    },
    {
      id: "movie-argument",
      prompt: "Name something friends argue about when choosing a movie.",
      answers: [
        { id: "genre", label: "The genre", points: 33 },
        { id: "who-picks", label: "Who picks", points: 23 },
        { id: "scary", label: "Too scary", points: 15 },
        { id: "long", label: "Too long", points: 12 },
        { id: "seen", label: "Seen it already", points: 10 },
        { id: "subtitles", label: "Subtitles", points: 7 },
      ],
    },
    {
      id: "group-chat-silent",
      prompt: "Name something that makes a group chat go silent.",
      answers: [
        { id: "plans", label: "Asking for plans", points: 28 },
        { id: "splitting-bill", label: "Splitting the bill", points: 22 },
        { id: "awkward", label: "An awkward message", points: 18 },
        { id: "long-story", label: "A very long story", points: 13 },
        { id: "work-question", label: "A work question", points: 11 },
        { id: "late-night", label: "It’s too late at night", points: 8 },
      ],
    },
  ],
  fastMoney: {
    timers: { first: 35, second: 40 },
    questions: [
      {
        id: "fm-morning-first",
        prompt: "Name something people do first thing in the morning.",
        answers: [
          { id: "check-phone", label: "Check their phone", points: 32, aliases: ["Phone"] },
          { id: "brush-teeth", label: "Brush their teeth", points: 25, aliases: ["Brush teeth"] },
          { id: "bathroom", label: "Use the bathroom", points: 18, aliases: ["Bathroom"] },
          { id: "coffee", label: "Drink coffee", points: 15, aliases: ["Coffee"] },
          { id: "shower", label: "Take a shower", points: 10, aliases: ["Shower"] },
        ],
      },
      {
        id: "fm-everywhere",
        prompt: "Name something people take with them everywhere.",
        answers: [
          { id: "phone", label: "Phone", points: 40, aliases: ["Cell phone"] },
          { id: "wallet", label: "Wallet", points: 20 },
          { id: "keys", label: "Keys", points: 18 },
          { id: "water-bottle", label: "Water bottle", points: 12, aliases: ["Water"] },
          { id: "sunglasses", label: "Sunglasses", points: 10, aliases: ["Shades"] },
        ],
      },
      {
        id: "fm-breakfast",
        prompt: "Name a popular breakfast food.",
        answers: [
          { id: "eggs", label: "Eggs", points: 30 },
          { id: "cereal", label: "Cereal", points: 25 },
          { id: "bacon", label: "Bacon", points: 20 },
          { id: "pancakes", label: "Pancakes", points: 15, aliases: ["Hotcakes"] },
          { id: "toast", label: "Toast", points: 10 },
        ],
      },
      {
        id: "fm-waiting",
        prompt: "Name something people hate waiting for.",
        answers: [
          { id: "traffic", label: "Traffic", points: 30 },
          { id: "food", label: "Food", points: 25, aliases: ["Their order"] },
          { id: "doctor", label: "The doctor", points: 20, aliases: ["Doctor"] },
          { id: "late-person", label: "Someone who is late", points: 15, aliases: ["A late friend"] },
          { id: "customer-service", label: "Customer service", points: 10, aliases: ["Being on hold"] },
        ],
      },
      {
        id: "fm-spending",
        prompt: "Name something people spend too much money on.",
        answers: [
          { id: "restaurants", label: "Food and restaurants", points: 30, aliases: ["Food", "Eating out"] },
          { id: "clothes", label: "Clothes", points: 20, aliases: ["Clothing"] },
          { id: "electronics", label: "Electronics", points: 18, aliases: ["Tech"] },
          { id: "cars", label: "Cars", points: 12, aliases: ["Car"] },
          { id: "entertainment", label: "Entertainment", points: 10 },
          { id: "coffee", label: "Coffee", points: 10 },
        ],
      },
    ],
  },
};

export const multiplierForRound = (round: number): number => {
  if (round >= 4) {
    return 3;
  }

  if (round === 3) {
    return 2;
  }

  return 1;
};
