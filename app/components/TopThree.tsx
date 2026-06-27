import type { LeaderboardEntry } from "../api/leaderboard/route";

const MEDALS = ["🥇", "🥈", "🥉"];
const RANK_COLORS = [
  "from-yellow-400/20 to-yellow-600/5 border-yellow-500/40",
  "from-gray-300/20 to-gray-500/5 border-gray-400/40",
  "from-amber-700/20 to-amber-900/5 border-amber-700/40",
];
const RANK_TEXT = ["rank-gold", "rank-silver", "rank-bronze"];
const RANK_BADGE_BG = ["bg-yellow-500/20 text-yellow-400", "bg-gray-400/20 text-gray-300", "bg-amber-700/20 text-amber-600"];

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TopThree({ entries }: { entries: LeaderboardEntry[] }) {
  // Render order: 2nd, 1st, 3rd (podium style)
  const order = entries.length === 1
    ? [entries[0]]
    : entries.length === 2
    ? [entries[1], entries[0]]
    : [entries[1], entries[0], entries[2]];

  return (
    <section className="mb-8">
      <h3 className="text-gray-400 text-xs uppercase tracking-widest mb-5 text-center">
        Top Wagerers
      </h3>
      <div className="flex items-end justify-center gap-4">
        {order.map((entry) => {
          const idx = entry.rank - 1;
          const isFirst = entry.rank === 1;
          return (
            <div
              key={entry.userId ?? entry.username}
              className={`
                flex-1 max-w-[200px] rounded-2xl border bg-gradient-to-b p-5
                ${RANK_COLORS[idx]}
                ${isFirst ? "mb-0" : "mb-4"}
                transition-transform hover:-translate-y-1 duration-200
              `}
            >
              <div className="text-center">
                <span className="text-4xl">{MEDALS[idx]}</span>
                <div
                  className={`text-2xl font-black mt-2 ${RANK_TEXT[idx]}`}
                >
                  #{entry.rank}
                </div>
                <p className="text-white font-semibold text-sm mt-2 truncate">
                  {entry.username}
                </p>
                <div
                  className={`inline-flex items-center gap-1 mt-3 px-3 py-1 rounded-full text-xs font-bold ${RANK_BADGE_BG[idx]}`}
                >
                  <span>$</span>
                  <span>{fmt(entry.totalWager)}</span>
                </div>
                <p className="text-gray-500 text-xs mt-1">Total Wagered</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
