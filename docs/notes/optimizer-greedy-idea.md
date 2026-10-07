# Idea: greedy, one-piece-at-a-time optimizer (user note, 2026-10-06)

Captured from the user's description; not implemented.

## Assumptions the user wants to exploit
- A higher-quality piece is better than any lower-quality piece, so we
  shouldn't compare e.g. a purple shield against a yellow crit: the yellow
  crit "will always be better, and that's true for everything".
- Weakened / poisoned / chilled all feed one damage pool (they are summed
  inside a single `(1 + x/100)` factor), so +10% poisoned is not a standalone
  multiplicative gain; it grows the shared pool.

## Proposed approach
1. Start from the current stats.
2. Take the highest-quality remaining piece(s).
3. For that piece, evaluate which stat placement would raise damage the most
   (given its percentage, one candidate at a time), including across all
   unlocked mounts using their sync rates.
4. Commit that pick, update the current stats, and repeat; the next pick is
   decided against the *new* stats (diminishing returns recalculated each step).
5. Goal: a near-complete/optimal result without enumerating every combination
   of every piece in memory at once.

## Open questions
- Shape/tiling constraints: pieces must physically tile the board.
- Cross-stat quality dominance is not strictly true for raw buff values
  (e.g. a good Skill Damage piece is +10, a legend Bosses piece is far
  smaller in raw terms); it only holds within the same stat.
