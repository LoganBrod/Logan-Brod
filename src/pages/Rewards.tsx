import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { CoinIcon, GiftIcon, TrophyIcon } from '../components/icons'
import { POINTS_PER_REWARD, SECONDS_PER_REWARD, useRewards } from '../features/rewards/useRewards'

function Banner({ variant, children }: { variant: 'success' | 'error'; children: ReactNode }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
        variant === 'success'
          ? 'border-(--color-primary)/40 bg-(--color-primary)/10 text-(--color-primary)'
          : 'border-(--color-loss)/40 bg-(--color-loss)/10 text-(--color-loss)'
      }`}
    >
      {children}
    </div>
  )
}

function Avatar({ src, name, className }: { src?: string; name: string; className: string }) {
  if (src) {
    return <img src={src} alt={name} className={`${className} object-cover`} />
  }
  return (
    <div className={`${className} flex items-center justify-center bg-(--color-surface-2) font-display font-bold text-gray-300`}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  )
}

export function Rewards() {
  const { me, leaderboard, status } = useRewards()
  const [searchParams] = useSearchParams()
  const setupResult = searchParams.get('setup')
  const error = searchParams.get('error')

  const minutesPerReward = SECONDS_PER_REWARD / 60
  const secondsToNext = me?.secondsToNextReward ?? SECONDS_PER_REWARD
  const progressPct = Math.min(100, Math.max(0, ((SECONDS_PER_REWARD - secondsToNext) / SECONDS_PER_REWARD) * 100))
  const minutesLeft = Math.max(1, Math.ceil(secondsToNext / 60))

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Rewards</h1>
        <p className="text-sm text-gray-400">
          Chat along while the stream is live to earn {POINTS_PER_REWARD} points every {minutesPerReward} minutes of
          activity. Track your balance and climb the leaderboard below.
        </p>
      </div>

      {setupResult === 'success' && (
        <Banner variant="success">Webhook subscription enabled &mdash; chat activity will now be tracked.</Banner>
      )}
      {setupResult === 'error' && (
        <Banner variant="error">Couldn&apos;t enable the webhook subscription. Check the server logs and try again.</Banner>
      )}
      {error === 'login_failed' && <Banner variant="error">Login with Kick failed. Please try again.</Banner>}
      {error === 'invalid_state' && <Banner variant="error">Your login session expired. Please try again.</Banner>}

      {status === 'loading' && (
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-6 text-sm text-gray-400">
          Loading rewards&hellip;
        </div>
      )}

      {status === 'unavailable' && (
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-6 text-sm text-gray-400">
          <p className="font-semibold text-gray-200">Rewards backend not connected</p>
          <p className="mt-1">
            This page talks to serverless API routes (<code>/api/me</code>, <code>/api/leaderboard</code>,{' '}
            <code>/api/auth/*</code>) that aren&apos;t running in this preview. Deploy the project (see the{' '}
            &ldquo;Kick rewards setup&rdquo; section of the README) to enable Login with Kick and live points.
          </p>
        </div>
      )}

      {status === 'ready' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-6">
            {!me?.authenticated ? (
              <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-6 text-center sm:p-8">
                <GiftIcon className="mx-auto h-10 w-10 text-(--color-primary)" />
                <h2 className="mt-3 font-display text-xl font-bold text-white">Login with Kick to start earning</h2>
                <p className="mx-auto mt-1 max-w-sm text-sm text-gray-400">
                  Chat in the stream while it&apos;s live &mdash; every {minutesPerReward} minutes of activity earns
                  you {POINTS_PER_REWARD} points.
                </p>
                <a href="/api/auth/login" className="mt-5 inline-block">
                  <Button>Login with Kick</Button>
                </a>
              </div>
            ) : (
              <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-6 sm:p-8">
                <div className="flex items-center gap-4">
                  <Avatar src={me.user?.avatar} name={me.user?.username ?? '?'} className="h-14 w-14 rounded-full border border-(--color-border)" />
                  <div>
                    <p className="font-display text-lg font-bold text-white">{me.user?.username}</p>
                    <p className="text-xs text-gray-500">{me.rank ? `Rank #${me.rank}` : 'Unranked'}</p>
                  </div>
                  <a href="/api/auth/logout" className="ml-auto">
                    <Button variant="ghost" className="text-xs">
                      Log out
                    </Button>
                  </a>
                </div>

                <div className="mt-6 flex items-center gap-3 rounded-xl border border-(--color-border) bg-(--color-surface-2) px-4 py-3">
                  <CoinIcon className="h-6 w-6 text-(--color-gold)" />
                  <span className="font-display text-2xl font-extrabold tabular-nums">{(me.points ?? 0).toLocaleString()}</span>
                  <span className="text-sm text-gray-400">points</span>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Next reward</span>
                    <span>+{POINTS_PER_REWARD} pts</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-(--color-surface-2)">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-(--color-primary) to-(--color-accent)"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">
                    ~{minutesLeft} more minute{minutesLeft === 1 ? '' : 's'} of chat activity while live
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-6">
              <div className="flex items-center gap-2">
                <GiftIcon className="h-5 w-5 text-(--color-accent)" />
                <h2 className="font-display text-lg font-bold text-white">Rewards catalog</h2>
                <span className="ml-auto rounded-full bg-(--color-surface-3) px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-300">
                  Coming soon
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-400">
                Redeeming points for perks and chat rewards is on the way. For now, keep stacking points &mdash; your
                balance and rank are tied to your Kick account.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <TrophyIcon className="h-5 w-5 text-(--color-gold)" />
              <h2 className="font-display text-lg font-bold text-white">Leaderboard</h2>
            </div>
            {leaderboard.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">No points earned yet &mdash; be the first to chat in!</p>
            ) : (
              <ol className="mt-4 flex flex-col gap-1.5">
                {leaderboard.map((entry) => (
                  <li
                    key={entry.userId}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${
                      entry.userId === me?.user?.id ? 'bg-(--color-primary)/10 text-(--color-primary)' : 'text-gray-300'
                    }`}
                  >
                    <span className="w-5 text-center font-display text-xs font-bold text-gray-500">{entry.rank}</span>
                    <Avatar src={entry.avatar} name={entry.username} className="h-7 w-7 rounded-full" />
                    <span className="flex-1 truncate font-semibold">{entry.username}</span>
                    <span className="font-display font-bold tabular-nums">{entry.points.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
