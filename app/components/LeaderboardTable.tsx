import type { LeaderboardEntry } from "../api/leaderboard/route";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function LeaderboardTable({
  entries,
  startRank,
}: {
  entries: LeaderboardEntry[];
  startRank: number;
}) {
  return (
    <section>
      <h3 className="text-gray-400 text-xs uppercase tracking-widest mb-4">
        Full Rankings
      </h3>
      <div className="bg-roobet-card border border-roobet-border rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-roobet-border">
              <th className="px-4 py-3 text-left text-gray-500 text-xs uppercase tracking-widest font-medium w-16">
                Rank
              </th>
              <th className="px-4 py-3 text-left text-gray-500 text-xs uppercase tracking-widest font-medium">
                Player
              </th>
              <th className="px-4 py-3 text-right text-gray-500 text-xs uppercase tracking-widest font-medium">
                Total Wagered
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr
                key={entry.userId ?? entry.username}
                className={`
                  border-b border-roobet-border/50 last:border-0
                  hover:bg-white/5 transition-colors duration-100
                  ${i % 2 === 0 ? "" : "bg-white/[0.02]"}
                `}
              >
                <td className="px-4 py-4">
                  <span className="text-gray-500 font-bold tabular-nums">
                    #{startRank + i}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <p className="text-white font-medium">{entry.username}</p>
                  {entry.userId && (
                    <p className="text-gray-600 text-xs mt-0.5 font-mono">
                      {entry.userId.slice(0, 8)}…
                    </p>
                  )}
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="text-roobet-gold font-bold tabular-nums">
                    ${fmt(entry.totalWager)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
