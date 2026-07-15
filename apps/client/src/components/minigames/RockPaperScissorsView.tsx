import { useState, useEffect } from "react";
import { RpsPublicState, RpsPrivateState, FinalChoice, Player } from "../../../../../packages/shared/src/types.ts";

interface Props {
  publicState: RpsPublicState;
  privateState: RpsPrivateState | null;
  players: Player[];
  myPlayerId: string;
  timeLeft: number | null;
  isAlive: boolean;
  gameState: string;
  finalDuelResults: any[];
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

export function RockPaperScissorsView({
  publicState, privateState, players, myPlayerId, timeLeft, isAlive,
  gameState, finalDuelResults, onSelect
}: Props) {
  const { round, scores, submittedCount, playerIds } = publicState;
  const myChoice = privateState?.myChoice ?? null;

  const p1 = players.find(p => p.id === playerIds[0]);
  const p2 = players.find(p => p.id === playerIds[1]);
  const isFinalist = playerIds.includes(myPlayerId);

  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    if (gameState === 'REVEALING') {
      setIsShaking(true);
      const timer = setTimeout(() => {
        setIsShaking(false);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setIsShaking(false);
    }
  }, [gameState, round]);

  const isRevealed = gameState === 'REVEALING' || gameState === 'MINIGAME_RESULT';
  const currentRoundResult = finalDuelResults && finalDuelResults.length > 0
    ? finalDuelResults[finalDuelResults.length - 1]
    : null;

  const s1 = currentRoundResult?.p1Selection ?? null;
  const s2 = currentRoundResult?.p2Selection ?? null;
  const rWinnerId = currentRoundResult?.winnerId ?? null;

  let leftEmoji = '✊';
  let rightEmoji = '✊';
  let leftLabel = '대기 중';
  let rightLabel = '대기 중';

  if (!isShaking && isRevealed) {
    leftEmoji = s1 ? RESULT_EMOJI[s1] : '✊';
    rightEmoji = s2 ? RESULT_EMOJI[s2] : '✊';
    leftLabel = s1 ? (s1 === 'ROCK' ? '바위' : s1 === 'PAPER' ? '보' : '가위') : '기권';
    rightLabel = s2 ? (s2 === 'ROCK' ? '바위' : s2 === 'PAPER' ? '보' : '가위') : '기권';
  }

  let leftHandClass = "";
  let rightHandClass = "scale-x-[-1]";
  if (isShaking) {
    leftHandClass = "rps-shaking-left";
    rightHandClass = "rps-shaking-right";
  } else if (isRevealed) {
    leftHandClass = "inline-block transform scale-110 transition-transform";
    rightHandClass = "inline-block transform scale-x-[-1] scale-110 transition-transform";
  }

  let middleText = "가위 바위 보...";
  let middleClass = "text-yellow-400 font-extrabold animate-pulse text-lg";

  if (!isShaking && isRevealed) {
    if (!s1 && !s2) {
      middleText = "둘 다 선택 안 함";
      middleClass = "text-gray-500 font-bold text-sm";
    } else if (rWinnerId === null) {
      middleText = "무승부 🤝";
      middleClass = "text-gray-300 font-black text-xl";
    } else {
      const winnerName = rWinnerId === playerIds[0] ? (p1?.nickname ?? 'Player 1') : (p2?.nickname ?? 'Player 2');
      middleText = `💥 ${winnerName} 승리!`;
      middleClass = "text-green-400 font-black text-xl drop-shadow-[0_0_15px_rgba(74,222,128,0.4)]";
    }
  }

  const leftWinner = !isShaking && isRevealed && rWinnerId === playerIds[0];
  const rightWinner = !isShaking && isRevealed && rWinnerId === playerIds[1];

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
        {!isRevealed && (
          <div className="text-sm text-gray-400 mt-2" id="rps-submitted-count">
            선택 완료 인원: <span className="text-white font-bold">{submittedCount} / 2명</span>
            {timeLeft !== null && (
              <span className={`ml-4 font-bold ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
                ⏱ {timeLeft}초
              </span>
            )}
          </div>
        )}
      </div>

      {isRevealed ? (
        /* 공개 및 결과 모드 */
        <div className="flex flex-col gap-6 w-full max-w-lg mx-auto">
          <div className="grid grid-cols-7 items-center gap-2 bg-slate-900/60 border border-slate-700/50 rounded-3xl p-6 backdrop-blur-md">
            {/* Left Player */}
            <div className={`col-span-3 flex flex-col items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-300 ${
              leftWinner ? 'bg-green-500/10 border-green-400 scale-105 shadow-[0_0_20px_rgba(74,222,128,0.2)]' : 'bg-slate-800/40 border-slate-700 opacity-80'
            }`}>
              <span className={`text-6xl ${leftHandClass}`}>{leftEmoji}</span>
              <div className="text-center w-full">
                <p className="text-xs text-gray-400 font-bold truncate">{p1?.nickname}</p>
                {!isShaking && s1 && (
                  <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded font-black ${
                    leftWinner ? 'bg-green-500/20 text-green-300' : 'bg-slate-700 text-slate-400'
                  }`}>{leftLabel}</span>
                )}
              </div>
            </div>

            {/* VS / Middle Status */}
            <div className="col-span-1 flex flex-col items-center justify-center min-w-[70px]">
              <div className={`text-center whitespace-nowrap px-1 ${middleClass}`}>
                {middleText}
              </div>
            </div>

            {/* Right Player */}
            <div className={`col-span-3 flex flex-col items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-300 ${
              rightWinner ? 'bg-green-500/10 border-green-400 scale-105 shadow-[0_0_20px_rgba(74,222,128,0.2)]' : 'bg-slate-800/40 border-slate-700 opacity-80'
            }`}>
              <span className={`text-6xl ${rightHandClass}`}>{rightEmoji}</span>
              <div className="text-center w-full">
                <p className="text-xs text-gray-400 font-bold truncate">{p2?.nickname}</p>
                {!isShaking && s2 && (
                  <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded font-black ${
                    rightWinner ? 'bg-green-500/20 text-green-300' : 'bg-slate-700 text-slate-400'
                  }`}>{rightLabel}</span>
                )}
              </div>
            </div>
          </div>
          <p className="text-center text-gray-500 text-xs animate-pulse">
            잠시 후 다음 결승 라운드로 넘어갑니다...
          </p>
        </div>
      ) : !isFinalist ? (
        /* 관전자 대기 모드 */
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-8 text-center max-w-sm mx-auto w-full">
          <p className="text-gray-400 text-lg">👁 결승전 관전 중</p>
          <p className="text-gray-500 text-sm mt-2">
            {p1?.nickname}와 {p2?.nickname}의 대결을 지켜보세요
          </p>
          <div className="flex justify-center gap-8 mt-6">
            <div className="text-center">
              <div className="text-5xl opacity-30">❓</div>
              <p className="text-gray-400 text-sm mt-2 font-bold truncate max-w-[80px]">{p1?.nickname}</p>
            </div>
            <div className="text-gray-500 text-2xl self-center">VS</div>
            <div className="text-center">
              <div className="text-5xl opacity-30">❓</div>
              <p className="text-gray-400 text-sm mt-2 font-bold truncate max-w-[80px]">{p2?.nickname}</p>
            </div>
          </div>
        </div>
      ) : (
        /* 결승 참가자 선택 모드 */
        <div id="final-symbol-grid" className="w-full">
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
            <div className="text-center bg-gray-800/50 border border-gray-700 rounded-xl px-6 py-4 w-48">
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
