import { useEffect, useState } from "react";
import { MinigameIntroInfo, MinigameType } from "../../../../../packages/shared/src/types.ts";

const MINIGAME_ICONS: Record<MinigameType, string> = {
  UNIQUE_SLOT: '🎯',
  MINORITY_BUTTON: '🔴',
  SHAPE_DECEPTION: '🔮',
  ROCK_PAPER_SCISSORS: '⚔️'
};

const MINIGAME_COLORS: Record<MinigameType, string> = {
  UNIQUE_SLOT: 'from-cyan-500/20 to-blue-600/20 border-cyan-500/40',
  MINORITY_BUTTON: 'from-rose-500/20 to-orange-600/20 border-rose-500/40',
  SHAPE_DECEPTION: 'from-violet-500/20 to-purple-600/20 border-violet-500/40',
  ROCK_PAPER_SCISSORS: 'from-yellow-500/20 to-amber-600/20 border-yellow-500/40'
};

interface Props {
  info: MinigameIntroInfo;
}

export function MinigameIntro({ info }: Props) {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(c => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const colorClass = MINIGAME_COLORS[info.type];

  return (
    <div className="flex-grow flex flex-col items-center justify-center min-h-[60vh]" id="minigame-intro-panel">
      <div
        className={`w-full max-w-xl bg-gradient-to-br ${colorClass} border rounded-3xl p-10 text-center space-y-6 animate-fade-in`}
        style={{ animation: 'minigameIntroSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      >
        {/* 아이콘 */}
        <div
          className="text-7xl leading-none"
          style={{ animation: 'pulse 1s ease-in-out infinite' }}
        >
          {MINIGAME_ICONS[info.type]}
        </div>

        {/* 미니게임 이름 */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2 font-semibold">미니게임</p>
          <h2
            id="minigame-intro-title"
            className="text-4xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300"
          >
            {info.displayName}
          </h2>
        </div>

        {/* 규칙 */}
        <p className="text-lg text-gray-300 leading-relaxed">
          {info.description}
        </p>

        {/* 통계 */}
        <div className="flex justify-center gap-8 text-sm">
          <div className="text-center">
            <p className="text-gray-400">생존 인원</p>
            <p className="text-2xl font-bold text-white">{info.aliveCount}명</p>
          </div>
          <div className="w-px bg-gray-700" />
          <div className="text-center">
            <p className="text-gray-400">제한 시간</p>
            <p className="text-2xl font-bold text-white">{info.durationSec}초</p>
          </div>
        </div>

        {/* 카운트다운 */}
        <div className="pt-2">
          <div
            key={countdown}
            className="text-6xl font-black tabular-nums"
            style={{
              color: countdown <= 1 ? '#FF6B6B' : countdown === 2 ? '#FBBF24' : '#4ADE80',
              animation: 'countdownPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
          >
            {countdown > 0 ? countdown : '시작!'}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes minigameIntroSlideIn {
          from { opacity: 0; transform: scale(0.8) translateY(30px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes countdownPop {
          from { opacity: 0; transform: scale(0.5); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
