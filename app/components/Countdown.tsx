"use client";

import { useEffect, useState } from "react";

function getTimeLeft(endDate: string) {
  const diff = new Date(endDate).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, ended: true };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    ended: false,
  };
}

export default function Countdown({ endDate }: { endDate: string }) {
  const [time, setTime] = useState(getTimeLeft(endDate));

  useEffect(() => {
    const tick = () => setTime(getTimeLeft(endDate));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endDate]);

  if (time.ended) {
    return (
      <span className="text-red-400 font-bold text-lg">Contest Ended</span>
    );
  }

  return (
    <div className="flex gap-3 items-center">
      <TimeUnit value={time.days} label="Days" />
      <Colon />
      <TimeUnit value={time.hours} label="Hrs" />
      <Colon />
      <TimeUnit value={time.minutes} label="Min" />
      <Colon />
      <TimeUnit value={time.seconds} label="Sec" />
    </div>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-roobet-gold font-bold text-2xl tabular-nums leading-none">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-gray-500 text-xs mt-0.5">{label}</span>
    </div>
  );
}

function Colon() {
  return <span className="text-roobet-gold font-bold text-xl leading-none mb-3">:</span>;
}
