# LuckyStack Casino

A free-play demo casino built with React, TypeScript, Vite, and Tailwind CSS,
inspired by the look and feel of sites like Shuffle and Roobet.

All balances are virtual demo credits stored in your browser&apos;s local
storage &mdash; **no real money is ever wagered, deposited, or paid out.**

## Games

- **Blackjack** &mdash; classic table game with hit, stand, double down,
  blackjack pays 3:2, dealer stands on 17.
- **Plinko** &mdash; canvas-based physics drop with selectable risk
  (low/medium/high) and row count (8/12/16), color-coded multiplier slots.

The lobby also previews a few "coming soon" games (Dice, Roulette, Crash,
Mines) for that full casino-lobby feel.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL in your browser. Use the **Refill** button
in the top bar to reset your demo balance back to 1,000 credits at any time.

## Scripts

- `npm run dev` &mdash; start the Vite dev server
- `npm run build` &mdash; type-check and build for production
- `npm run preview` &mdash; preview the production build
- `npm run lint` &mdash; run ESLint
