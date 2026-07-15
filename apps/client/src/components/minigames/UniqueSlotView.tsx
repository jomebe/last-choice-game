import { useState, useEffect } from "react";
import { UniqueSlotPublicState, UniqueSlotPrivateState, Player } from "../../../../../packages/shared/src/types.ts";
import { MinigameResultView } from "./MinigameResultView.tsx";

interface Props {
  publicState: UniqueSlotPublicState;
  privateState: UniqueSlotPrivateState | null;
  players: Player[];
  myPlayerId: string;
  timeLeft: number | null;
  isAlive: boolean;
  gameState: string;
  roundResults: any[];
  minigameResults: any[];
  onSelect: (slot: number) => void;
}

export function UniqueSlotView({
  publicState, privateState, players, myPlayerId, timeLeft, isAlive,
  gameState, roundResults, minigameResults, onSelect
}: Props) {
  const { slotCount, submittedCount } = publicState;
  const mySelection = privateState?.mySelection ?? null;
  const alivePlayers = players.filter(p => p.isAlive);

  const cols = slotCount <= 3 ? slotCount : slotCount <= 6 ? 3 : 3;
  const isRevealed = gameState === 'REVEALING' || gameState === 'MINIGAME_RESULT';

  const [flipTrigger, setFlipTrigger] = useState(false);
  useEffect(() => {
    if (isRevealed) {
      const timer = setTimeout(() => {
        setFlipTrigger(true);
      }, 200);
      return () => clearTimeout(timer);
    } else {
      setFlipTrigger(false);
    }
  }, [gameState]);

  // 이 라운드 유저 선택 계산
  const selections = publicState.selections ?? null;
  const slotCounts: Record<number, number> = {};
  const slotPlayers: Record<number, string[]> = {};
  for (let s = 1; s <= slotCount; s++) {
    slotCounts[s] = 0;
    slotPlayers[s] = [];
  }
  if (selections) {
    for (const [pId, slot] of Object.entries(selections)) {
      if (slot !== null && slot !== undefined) {
        slotCounts[slot] = (slotCounts[slot] ?? 0) + 1;
        const player = players.find(p => p.id === pId);
        if (player) {
          slotPlayers[slot].push(player.nickname);
        }
      }
    }
  }

  return (
    <div className="flex-grow flex flex-col gap-6" id="selecting-panel">
      {/* 헤더 */}
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-brand-cyan">혼자 골라야 산다</h2>
        <p className="text-gray-400 text-sm">
          {isRevealed ? "선택 결과 공개" : "같은 칸을 고른 사람은 모두 탈락"}
        </p>
        <div className="flex justify-center gap-4 text-sm mt-2">
          {!isRevealed && (
            <span className="text-gray-400">선택 완료: <span className="text-white font-bold">{submittedCount} / {alivePlayers.length}명</span></span>
          )}
          {timeLeft !== null && !isRevealed && (
            <span className={`font-bold ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-brand-cyan'}`}>
              ⏱ {timeLeft}초
            </span>
          )}
        </div>
      </div>

      {/* 관전자 안내 */}
      {!isAlive && !isRevealed && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center text-gray-400">
          👁 관전 중 — 번호를 선택할 수 없습니다
        </div>
      )}

      {/* 번호 그리드 (3D 카드 뒤집기 지원) */}
      <div
        className="grid gap-4 mx-auto w-full max-w-sm"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        id="slot-grid"
      >
        {Array.from({ length: slotCount }, (_, i) => i + 1).map(slot => {
          const isSelected = mySelection === slot;
          const count = slotCounts[slot] ?? 0;
          const nicknames = slotPlayers[slot] || [];

          // 결과 카드의 배경색 및 상태 테두리
          let backColorClass = "bg-slate-800/50 border-slate-700 text-slate-400";
          let countColorClass = "text-slate-400";
          if (count === 1) {
            backColorClass = "bg-green-500/10 border-green-500/80 text-green-300 shadow-[0_0_15px_rgba(34,197,94,0.2)]";
            countColorClass = "text-green-400 font-bold";
          } else if (count > 1) {
            backColorClass = "bg-red-500/10 border-red-500/80 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.2)]";
            countColorClass = "text-red-400 font-bold";
          }

          return (
            <div
              key={slot}
              id={`slot-${slot}`}
              className="aspect-square flip-container w-full"
            >
              <div
                className={`flip-card-inner w-full h-full ${flipTrigger ? 'is-flipped' : ''}`}
                style={{ transitionDelay: `${slot * 70}ms` }}
              >
                {/* 앞면: 선택 버튼 */}
                <button
                  disabled={!isAlive || isRevealed}
                  onClick={() => onSelect(slot)}
                  className={[
                    "flip-card-front w-full h-full flex items-center justify-center rounded-2xl text-3xl font-black select-none",
                    "border-2 shadow-lg",
                    isAlive && !isRevealed ? "hover:scale-105 active:scale-95 cursor-pointer" : "cursor-default opacity-50",
                    isSelected
                      ? "bg-brand-cyan/20 border-brand-cyan text-brand-cyan shadow-cyan-500/30 scale-105"
                      : "bg-dark-card border-gray-700 text-gray-200 hover:border-gray-500"
                  ].join(" ")}
                >
                  {slot}
                </button>

                {/* 뒷면: 선택 결과 */}
                <div
                  className={`flip-card-back w-full h-full flex flex-col items-center justify-between p-2 rounded-2xl border-2 text-center select-none ${backColorClass}`}
                >
                  <span className="text-[10px] uppercase font-bold text-gray-500">#{slot}</span>
                  <div className="flex flex-col items-center justify-center flex-grow">
                    <span className={`text-2xl font-black ${countColorClass}`}>{count}명</span>
                    {nicknames.length > 0 && (
                      <p className="text-[9px] mt-1 font-medium max-w-[80px] truncate leading-none text-white/70">
                        {nicknames.join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="text-[9px] font-semibold text-gray-500">
                    {count === 1 ? '생존' : count > 1 ? '탈락' : '비었음'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 선택 확인 */}
      {isAlive && mySelection !== null && !isRevealed && (
        <div className="text-center mt-2 animate-fade-in">
          <span className="inline-flex items-center gap-2 bg-brand-cyan/10 border border-brand-cyan/30 rounded-full px-4 py-2 text-brand-cyan text-sm font-semibold">
            ✓ {mySelection}번 선택 완료 — 제한 시간 전까지 변경 가능
          </span>
        </div>
      )}

      {/* 결과 패널 */}
      {isRevealed && minigameResults.length > 0 && (
        <div className="w-full max-w-md mx-auto mt-6 animate-fade-in">
          <MinigameResultView
            result={minigameResults[minigameResults.length - 1]}
            players={players}
          />
        </div>
      )}
    </div>
  );
}
