import { useState, useEffect } from "react";
import { RpsPublicState, RpsPrivateState, FinalChoice, Player } from "../../../../../packages/shared/src/types.ts";

interface Props {
  publicState: RpsPublicState;
  privateState: RpsPrivateState | null;
  players: Player[];
  myPlayerId: string;
  timeLeft: number | null;
  isAlive: boolean;
  onSelect: (choice: FinalChoice) => void;
}

const CHOICES: { id: FinalChoice; emoji: string; label: string; color: string }[] = [
  { id: 'ROCK',     emoji: '✊', label: '바위', color: '#94A3B8' },
  { id: 'SCISSORS', emoji: '✌️', label: '가위', color: '#F87171' },
  { id: 'PAPER',    emoji: '🖐', label: '보',   color: '#4ADE80' },
];

const RESULT_EMOJI: Record<string, string> = {
  ROCK: '✊', SCISSORS: '✌️', PAPER: '🖐'
};

function ChoiceCard({
  choice, label, emoji, color, isSelected, disabled, onClick
}: {
  choice: FinalChoice; label: string; emoji: string; color: string;
  isSelected: boolean; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      id={`rps-${label}`}
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex flex-col items-center gap-3 py-8 px-4 rounded-2xl border-2 transition-all duration-200 select-none",
        disabled ? "cursor-default" : "hover:scale-105 active:scale-95 cursor-pointer",
        isSelected
          ? "scale-105 ring-4 ring-white/30"
          : disabled ? "opacity-60" : "hover:opacity-90"
      ].join(" ")}
      style={{
        backgroundColor: isSelected ? color + '30' : color + '15',
        borderColor: isSelected ? color : color + '50',
        boxShadow: isSelected ? `0 0 30px ${color}40, 0 0 60px ${color}20` : undefined
      }}
    >
      <span
        className="text-6xl transition-transform duration-200"
        style={{ transform: isSelected ? 'scale(1.2)' : 'scale(1)' }}
      >
        {emoji}
      </span>
      <span className="text-xl font-black" style={{ color }}>
        {label}
      </span>
      {isSelected && (
        <span className="text-xs text-white/60 font-semibold">✓ 선택됨</span>
      )}
    </button>
  );
}

export function RockPaperScissorsView({ publicState, privateState, players, myPlayerId, timeLeft, isAlive, onSelect }: Props) {
  const { round, scores, submittedCount, playerIds } = publicState;
  const myChoice = privateState?.myChoice ?? null;

  const p1 = players.find(p => p.id === playerIds[0]);
  const p2 = players.find(p => p.id === playerIds[1]);
  const isFinalist = playerIds.includes(myPlayerId);

  return (
    <div className="flex-grow flex flex-col gap-6" id="final-duel-panel">
      {/* 헤더 */}
      <div className="text-center space-y-1">
        <div className="text-xs text-yellow-400 uppercase tracking-widest font-semibold">⚔️ 결승전</div>
        <h2 id="final-round-title" className="text-3xl font-black">결승 {round}라운드</h2>

        {/* 점수판 */}
        <div className="flex justify-center items-center gap-6 mt-4">
          <div className="text-right">
            <p className="font-bold text-white">{p1?.nickname ?? '—'}</p>
            <p className="text-4xl font-black text-yellow-400 tabular-nums">{scores[playerIds[0]] ?? 0}</p>
          </div>
          <div className="text-2xl text-gray-500 font-bold">VS</div>
          <div className="text-left">
            <p className="font-bold text-white">{p2?.nickname ?? '—'}</p>
            <p className="text-4xl font-black text-yellow-400 tabular-nums">{scores[playerIds[1]] ?? 0}</p>
          </div>
        </div>
        <p className="text-xs text-gray-500">2점 선취 시 최종 우승</p>

        {/* 선택 현황 */}
        <div className="text-sm text-gray-400 mt-2" id="rps-submitted-count">
          선택 완료 인원: <span className="text-white font-bold">{submittedCount} / 2명</span>
          {timeLeft !== null && (
            <span className={`ml-4 font-bold ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
              ⏱ {timeLeft}초
            </span>
          )}
        </div>
      </div>

      {!isFinalist ? (
        /* 관전자 */
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-lg">👁 결승전 관전 중</p>
          <p className="text-gray-500 text-sm mt-2">
            {p1?.nickname}와 {p2?.nickname}의 대결을 지켜보세요
          </p>
          <div className="flex justify-center gap-8 mt-6">
            <div className="text-center">
              <div className="text-5xl opacity-30">❓</div>
              <p className="text-gray-400 text-sm mt-2">{p1?.nickname}</p>
            </div>
            <div className="text-gray-500 text-2xl self-center">VS</div>
            <div className="text-center">
              <div className="text-5xl opacity-30">❓</div>
              <p className="text-gray-400 text-sm mt-2">{p2?.nickname}</p>
            </div>
          </div>
        </div>
      ) : (
        /* 결승 참가자 */
        <div id="final-symbol-grid">
          <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
            {CHOICES.map(c => (
              <ChoiceCard
                key={c.id}
                choice={c.id}
                label={c.label}
                emoji={c.emoji}
                color={c.color}
                isSelected={myChoice === c.id}
                disabled={!isAlive}
                onClick={() => onSelect(c.id)}
              />
            ))}
          </div>

          {/* 상대 선택 상태 */}
          <div className="flex justify-center mt-6">
            <div className="text-center bg-gray-800/50 border border-gray-700 rounded-xl px-6 py-4">
              <p className="text-xs text-gray-400 mb-2">상대방</p>
              <p className="text-3xl">{submittedCount >= 2 ? '✓' : submittedCount === 1 && myChoice ? '⏳' : '❓'}</p>
              <p className="text-xs text-gray-500 mt-1">
                {submittedCount >= 2 ? '모두 선택 완료' : submittedCount === 1 && myChoice ? '상대 선택 대기 중' : '선택 대기 중'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
