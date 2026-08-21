import { describe, it, expect } from 'vitest';
import {
  buyDevCard, playableDevCards, playKnight, playMonopoly, playYearOfPlenty,
  playRoadBuilding, victoryPointCards, createDevDeck,
} from '../engine/devcards.js';
import { applyAction } from '../engine/game.js';
import { updateLargestArmy } from '../engine/awards.js';
import { EXTENSION_DEV_DECK } from '../engine/constants.js';
import { makeGame, pose, cornersOf, ringOf } from './helpers.js';

/** Put a ready-to-play card in a player's hand (bought on an earlier turn). */
function give(state, playerIndex, type, boughtTurn = 0) {
  state.players[playerIndex].devCards.push({ type, boughtTurn, played: false });
}

describe('the development deck', () => {
  it('holds 25 cards in the base game', () => {
    const s = makeGame();
    const deck = createDevDeck(s, 'original');
    expect(deck).toHaveLength(25);
    expect(deck.filter((c) => c === 'knight')).toHaveLength(14);
    expect(deck.filter((c) => c === 'victoryPoint')).toHaveLength(5);
  });

  it('matches the declared spec with the 5-6 player extension', () => {
    // The extension deck is a documented extrapolation (see EXTENSION_DEV_DECK),
    // so this asserts the deck matches its own spec rather than a fixed total.
    const s = makeGame();
    const deck = createDevDeck(s, 'extension');
    const expected = Object.values(EXTENSION_DEV_DECK).reduce((a, b) => a + b, 0);
    expect(deck).toHaveLength(expected);
    for (const [type, count] of Object.entries(EXTENSION_DEV_DECK)) {
      expect(deck.filter((c) => c === type)).toHaveLength(count);
    }
  });

  it('charges sheep, wheat and ore and returns them to the bank', () => {
    const s = makeGame();
    s.turn = 1;
    s.players[0].resources = { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1 };
    const bankBefore = { ...s.bank };
    const deckBefore = s.devDeck.length;

    buyDevCard(s, 'p0');
    expect(s.players[0].devCards).toHaveLength(1);
    expect(s.devDeck).toHaveLength(deckBefore - 1);
    expect(s.players[0].resources).toEqual({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
    for (const r of ['sheep', 'wheat', 'ore']) expect(s.bank[r]).toBe(bankBefore[r] + 1);
  });

  it('refuses a purchase that cannot be paid for', () => {
    const s = makeGame();
    expect(() => buyDevCard(s, 'p0')).toThrow(/afford/);
  });

  it('refuses a purchase from an empty deck', () => {
    const s = makeGame();
    s.devDeck = [];
    s.players[0].resources = { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1 };
    expect(() => buyDevCard(s, 'p0')).toThrow(/empty/);
  });
});

describe('when a card may be played', () => {
  it('not on the turn it was bought', () => {
    const s = makeGame();
    s.turn = 3;
    give(s, 0, 'knight', 3);
    expect(playableDevCards(s, 'p0')).toHaveLength(0);
  });

  it('yes on a later turn', () => {
    const s = makeGame();
    s.turn = 4;
    give(s, 0, 'knight', 3);
    expect(playableDevCards(s, 'p0').map((c) => c.type)).toEqual(['knight']);
  });

  it('never for victory point cards — they are held, not played', () => {
    const s = makeGame();
    s.turn = 4;
    give(s, 0, 'victoryPoint', 1);
    expect(playableDevCards(s, 'p0')).toHaveLength(0);
    expect(victoryPointCards(s.players[0])).toBe(1);
  });

  it('only one card per turn', () => {
    const s = makeGame();
    s.turn = 4;
    give(s, 0, 'monopoly', 1);
    give(s, 0, 'yearOfPlenty', 1);
    playMonopoly(s, 'p0', 'wood');
    expect(playableDevCards(s, 'p0')).toHaveLength(0);
    expect(() => playYearOfPlenty(s, 'p0', ['wood', 'ore'])).toThrow(/No playable/);
  });

  it('not at all if the player has no such card', () => {
    const s = makeGame();
    s.turn = 4;
    expect(() => playMonopoly(s, 'p0', 'wood')).toThrow(/No playable/);
  });
});

describe('knight', () => {
  it('moves the robber, steals, and counts toward the army', () => {
    const s = makeGame();
    s.turn = 4;
    give(s, 0, 'knight', 1);
    const hex = s.board.hexes.find((h) => h.number != null && h.id !== s.robberHexId);
    const corners = cornersOf(hex.q, hex.r);
    pose(s, 0, { settlements: [corners[0]] });
    pose(s, 1, { settlements: [corners[2]] });
    s.players[1].resources.ore = 2;

    playKnight(s, 'p0', hex.id, 'p1');
    expect(s.players[0].knightsPlayed).toBe(1);
    expect(s.robberHexId).toBe(hex.id);
    expect(s.players[0].resources.ore).toBe(1);
    expect(s.players[1].resources.ore).toBe(1);
  });
});

describe('largest army', () => {
  it('needs three knights', () => {
    const s = makeGame();
    s.players[0].knightsPlayed = 2;
    updateLargestArmy(s);
    expect(s.largestArmy.playerId).toBeNull();
    s.players[0].knightsPlayed = 3;
    updateLargestArmy(s);
    expect(s.largestArmy).toEqual({ playerId: 'p0', size: 3 });
  });

  it('stays with the holder on a tie', () => {
    const s = makeGame();
    s.players[0].knightsPlayed = 3;
    updateLargestArmy(s);
    s.players[1].knightsPlayed = 3;
    updateLargestArmy(s);
    expect(s.largestArmy.playerId).toBe('p0');
  });

  it('transfers on a strictly larger army', () => {
    const s = makeGame();
    s.players[0].knightsPlayed = 3;
    updateLargestArmy(s);
    s.players[1].knightsPlayed = 4;
    updateLargestArmy(s);
    expect(s.largestArmy).toEqual({ playerId: 'p1', size: 4 });
  });
});

describe('monopoly', () => {
  it('sweeps one resource from every opponent', () => {
    const s = makeGame();
    s.turn = 4;
    give(s, 0, 'monopoly', 1);
    s.players[1].resources = { wood: 3, brick: 1, sheep: 0, wheat: 0, ore: 0 };
    s.players[2].resources = { wood: 2, brick: 0, sheep: 5, wheat: 0, ore: 0 };

    playMonopoly(s, 'p0', 'wood');
    expect(s.players[0].resources.wood).toBe(5);
    expect(s.players[1].resources.wood).toBe(0);
    expect(s.players[2].resources.wood).toBe(0);
    // Untouched resources stay put.
    expect(s.players[1].resources.brick).toBe(1);
    expect(s.players[2].resources.sheep).toBe(5);
  });
});

describe('year of plenty', () => {
  it('takes exactly two cards from the bank', () => {
    const s = makeGame();
    s.turn = 4;
    give(s, 0, 'yearOfPlenty', 1);
    const before = { ore: s.bank.ore, wheat: s.bank.wheat };

    playYearOfPlenty(s, 'p0', ['ore', 'wheat']);
    expect(s.players[0].resources.ore).toBe(1);
    expect(s.players[0].resources.wheat).toBe(1);
    expect(s.bank.ore).toBe(before.ore - 1);
    expect(s.bank.wheat).toBe(before.wheat - 1);
  });

  it('allows two of the same resource', () => {
    const s = makeGame();
    s.turn = 4;
    give(s, 0, 'yearOfPlenty', 1);
    playYearOfPlenty(s, 'p0', ['ore', 'ore']);
    expect(s.players[0].resources.ore).toBe(2);
  });

  it('rejects the wrong number of picks', () => {
    const s = makeGame();
    s.turn = 4;
    give(s, 0, 'yearOfPlenty', 1);
    expect(() => playYearOfPlenty(s, 'p0', ['ore'])).toThrow(/exactly two/);
  });

  it('rejects a resource the bank has run out of', () => {
    const s = makeGame();
    s.turn = 4;
    give(s, 0, 'yearOfPlenty', 1);
    s.bank.ore = 0;
    expect(() => playYearOfPlenty(s, 'p0', ['ore', 'wheat'])).toThrow(/no ore/);
  });
});

describe('road building', () => {
  it('builds two roads without spending resources', () => {
    const s = makeGame();
    s.turn = 4;
    give(s, 0, 'roadBuilding', 1);
    const ring = ringOf(0, 0);
    // A settlement to anchor the first road, then the road next to it.
    pose(s, 0, { settlements: [cornersOf(0, 0)[0]] });

    playRoadBuilding(s, 'p0', [ring[0], ring[1]]);
    expect(s.players[0].roads).toHaveLength(2);
    expect(s.players[0].resources).toEqual({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
  });

  it('still obeys the connection rule', () => {
    const s = makeGame();
    s.turn = 4;
    give(s, 0, 'roadBuilding', 1);
    // No settlement and no roads: nothing to build from.
    expect(() => playRoadBuilding(s, 'p0', ringOf(0, 0).slice(0, 2))).toThrow(/connect/);
  });
});

describe('victory point cards', () => {
  it('count toward the win but stay out of the playable list', () => {
    const s = makeGame();
    s.turn = 4;
    give(s, 0, 'victoryPoint', 1);
    give(s, 0, 'victoryPoint', 1);
    expect(victoryPointCards(s.players[0])).toBe(2);
    expect(playableDevCards(s, 'p0')).toHaveLength(0);
  });
});
