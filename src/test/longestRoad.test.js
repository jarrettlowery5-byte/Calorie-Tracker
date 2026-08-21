import { describe, it, expect } from 'vitest';
import { longestRoadLength, updateLongestRoad } from '../engine/awards.js';
import { makeGame, pose, ringOf, cornersOf } from './helpers.js';

describe('longest road', () => {
  it('is zero with no roads', () => {
    const s = makeGame();
    expect(longestRoadLength(s, 'p0')).toBe(0);
  });

  it('counts a simple chain', () => {
    const s = makeGame();
    // Five consecutive edges of the ring around hex (0,0) form an open path.
    pose(s, 0, { roads: ringOf(0, 0).slice(0, 5) });
    expect(longestRoadLength(s, 'p0')).toBe(5);
  });

  it('counts a closed loop as its full length', () => {
    const s = makeGame();
    pose(s, 0, { roads: ringOf(0, 0) });
    expect(longestRoadLength(s, 'p0')).toBe(6);
  });

  it('takes the longest branch, not the total road count', () => {
    const s = makeGame();
    // A ring around (0,0) plus a spur genuinely attached to it: the trail runs
    // up the spur and then all the way round the ring, using no edge twice.
    const ring = ringOf(0, 0);
    const ringNodes = new Set(ring.flatMap((e) => e.split('::')));
    const spur = ringOf(1, 0).find(
      (e) => !ring.includes(e) && e.split('::').some((n) => ringNodes.has(n)),
    );
    pose(s, 0, { roads: [...ring, spur] });
    expect(s.players[0].roads).toHaveLength(7);
    expect(longestRoadLength(s, 'p0')).toBe(7);
  });

  it('is cut where an opponent has built', () => {
    const s = makeGame();
    const ring = ringOf(0, 0);
    const corners = cornersOf(0, 0);
    // An open path of five roads, with an enemy settlement in the middle of it.
    pose(s, 0, { roads: ring.slice(0, 5) });
    pose(s, 1, { settlements: [corners[1]] });
    const cut = longestRoadLength(s, 'p0');
    expect(cut).toBeLessThan(5);
    expect(cut).toBeGreaterThan(0);
  });

  it('lets a road end at an opponent building without being shortened', () => {
    const s = makeGame();
    const ring = ringOf(0, 0);
    // A loop with an enemy settlement on one of its nodes is still six long:
    // the trail starts and ends there rather than passing through.
    pose(s, 0, { roads: ring });
    pose(s, 1, { settlements: [cornersOf(0, 0)[2]] });
    expect(longestRoadLength(s, 'p0')).toBe(6);
  });

  it('does not merge two players\' roads', () => {
    const s = makeGame();
    const ring = ringOf(0, 0);
    pose(s, 0, { roads: ring.slice(0, 3) });
    pose(s, 1, { roads: ring.slice(3, 6) });
    expect(longestRoadLength(s, 'p0')).toBe(3);
    expect(longestRoadLength(s, 'p1')).toBe(3);
  });
});

describe('longest road award', () => {
  it('is not awarded below five roads', () => {
    const s = makeGame();
    pose(s, 0, { roads: ringOf(0, 0).slice(0, 4) });
    updateLongestRoad(s);
    expect(s.longestRoad.playerId).toBeNull();
  });

  it('goes to the first player to reach five', () => {
    const s = makeGame();
    pose(s, 0, { roads: ringOf(0, 0).slice(0, 5) });
    updateLongestRoad(s);
    expect(s.longestRoad).toEqual({ playerId: 'p0', length: 5 });
  });

  it('stays with the holder when an opponent merely ties', () => {
    const s = makeGame();
    pose(s, 0, { roads: ringOf(0, 0).slice(0, 5) });
    updateLongestRoad(s);
    pose(s, 1, { roads: ringOf(2, -2).slice(0, 5) });
    updateLongestRoad(s);
    expect(s.longestRoad.playerId).toBe('p0');
  });

  it('transfers when an opponent goes strictly longer', () => {
    const s = makeGame();
    pose(s, 0, { roads: ringOf(0, 0).slice(0, 5) });
    updateLongestRoad(s);
    pose(s, 1, { roads: ringOf(2, -2) });
    updateLongestRoad(s);
    expect(s.longestRoad).toEqual({ playerId: 'p1', length: 6 });
  });

  it('is given up when the holder drops below five', () => {
    const s = makeGame();
    pose(s, 0, { roads: ringOf(0, 0).slice(0, 5) });
    updateLongestRoad(s);
    expect(s.longestRoad.playerId).toBe('p0');
    s.players[0].roads = s.players[0].roads.slice(0, 3);
    updateLongestRoad(s);
    expect(s.longestRoad.playerId).toBeNull();
  });

  it('is set aside when two challengers tie past the holder', () => {
    const s = makeGame({ players: 3 });
    pose(s, 0, { roads: ringOf(0, 0).slice(0, 5) });
    updateLongestRoad(s);
    expect(s.longestRoad.playerId).toBe('p0');
    // Both opponents build a six-loop, leaving the holder behind but tied.
    pose(s, 1, { roads: ringOf(2, -2) });
    pose(s, 2, { roads: ringOf(-2, 2) });
    updateLongestRoad(s);
    expect(s.longestRoad.playerId).toBeNull();
  });
});
