import { useState, useEffect } from "react";
import { MinorityButtonPublicState, MinorityButtonPrivateState, Player } from "../../../../../packages/shared/src/types.ts";
import { MinigameResultView } from "./MinigameResultView.tsx";

interface Props {
  publicState: MinorityButtonPublicState;
  privateState: MinorityButtonPrivateState | null;
  players: Player[];
  myPlayerId: string;
  timeLeft: number | null;
  isAlive: boolean;
  gameState: string;
  minigameResults: any[];
  onSelect: (buttonId: string) => void;
}

export function MinorityButtonView({
  publicState, privateState, players, myPlayerId, timeLeft, isAlive,
  gameState, minigameResults, onSelect
}: Props) {
  const { buttons, submittedCount } = publicState;
  const mySelection = privateState?.mySelection ?? null;
  const alivePlayers = players.filter(p => p.isAlive);
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

  // 버튼별 선택 계산
  const selections = publicState.selections ?? null;
  const buttonCounts: Record<string, number> = {};
  const buttonPlayers: Record<string, string[]> = {};
  for (const b of buttons) {
    buttonCounts[b.id] = 0;
    buttonPlayers[b.id] = [];
  }
  if (selections) {
    for (const [pId, btnId] of Object.entries(selections)) {
      if (btnId) {
        buttonCounts[btnId] = (buttonCounts[btnId] ?? 0) + 1;
        const player = players.find(p => p.id === pId);
        if (player) {
          buttonPlayers[btnId].push(player.nickname);
        }
      }
    }
  }

  const chosenCounts = Object.values(buttonCounts).filter(c => c > 0);
  const minCount = chosenCounts.length > 0 ? Math.min(...chosenCounts) : 0;

  return (
    <div className="flex-grow flex flex-col gap-6" id="minority-button-panel">
      {/* 헤더 */}
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold" style={{ color: '#F97316' }}>가장 적은 선택은 탈락</h2>
        <p className="text-gray-400 text-sm">
          {isRevealed ? "선택 결과 공개" : "가장 적게 선택된 버튼을 고른 사람은 탈락"}
        </p>
        <div className="flex justify-center gap-4 text-sm mt-2">
          {!isRevealed && (
            <span className="text-gray-400">선택 완료: <span className="text-white font-bold">{submittedCount} / {alivePlayers.length}명</span></span>
          )}
          {timeLeft !== null && !isRevealed && (
            <span className={`font-bold ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-orange-400'}`}>
              ⏱ {timeLeft}초
            </span>
          )}
        </div>
      </div>

      {/* 관전자 안내 */}
      {!isAlive && !isRevealed && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center text-gray-400">
          👁 관전 중 — 버튼을 선택할 수 없습니다
        </div>
      )}

      {/* 버튼 그리드 (3D 카드 뒤집기 지원) */}
      <div
        className="grid gap-4 mx-auto w-full max-w-md"
        style={{ gridTemplateColumns: `repeat(${Math.min(3, buttons.length)}, 1fr)` }}
        id="minority-button-grid"
      >
        {buttons.map((btn, idx) => {
          const isSelected = mySelection === btn.id;
          const count = buttonCounts[btn.id] ?? 0;
          const nicknames = buttonPlayers[btn.id] || [];

          // 결과 카드의 배경색 및 상태 테두리
          let backColorClass = "bg-slate-800/50 border-slate-700 text-slate-400";
          let countColorClass = "text-slate-400";
          let statusText = "비었음";

          if (count > 0) {
            if (count === minCount) {
              backColorClass = "bg-red-500/10 border-red-500/80 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.2)]";
              countColorClass = "text-red-400 font-bold";
              statusText = "탈락 (소수)";
            } else {
              backColorClass = "bg-green-500/10 border-green-500/80 text-green-300 shadow-[0_0_15px_rgba(34,197,94,0.2)]";
              countColorClass = "text-green-400 font-bold";
              statusText = "생존 (다수)";
            }
          }

          return (
            <div
              key={btn.id}
              id={`minority-btn-${btn.id}`}
              className="h-32 flip-container w-full"
            >
              <div
                className={`flip-card-inner w-full h-full ${flipTrigger ? 'is-flipped' : ''}`}
                style={{ transitionDelay: `${idx * 150}ms` }}
              >
                {/* 앞면: 버튼 카드 */}
                <button
                  disabled={!isAlive || isRevealed}
                  onClick={() => onSelect(btn.id)}
                  className={[
                    "flip-card-front w-full h-full flex flex-col items-center justify-center gap-2 rounded-2xl border-2 shadow-lg transition-all duration-200",
                    isAlive && !isRevealed ? "hover:scale-105 active:scale-95 cursor-pointer" : "cursor-default opacity-50",
                    isSelected ? "ring-4 ring-white/30" : "opacity-80 hover:opacity-100"
                  ].join(" ")}
                  style={{
                    backgroundColor: isSelected ? btn.color + '40' : btn.color + '20',
                    borderColor: isSelected ? btn.color : btn.color + '60',
                    color: btn.color,
                    boxShadow: isSelected ? `0 0 20px ${btn.color}40` : undefined
                  }}
                >
                  <span className="text-3xl font-black">{btn.label}</span>
                  {isSelected && (
                    <span className="text-xs font-normal text-white/70 text-center leading-tight">
                      ✓ 선택됨
                    </span>
                  )}
                </button>

                {/* 뒷면: 결과 카드 */}
                <div
                  className={`flip-card-back w-full h-full flex flex-col items-center justify-between p-2 rounded-2xl border-2 text-center select-none ${backColorClass}`}
                >
                  <span className="text-[10px] uppercase font-bold text-gray-500">{btn.label} 결과</span>
                  <div className="flex flex-col items-center justify-center flex-grow">
                    <span className={`text-2xl font-black ${countColorClass}`}>{count}명</span>
                    {nicknames.length > 0 && (
                      <p className="text-[9px] mt-1 font-medium max-w-[100px] truncate leading-none text-white/70">
                        {nicknames.join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="text-[9px] font-semibold text-gray-500">{statusText}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 선택 확인 */}
      {isAlive && mySelection !== null && !isRevealed && (
        <div className="text-center mt-2 animate-fade-in">
          <span className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-2 text-orange-300 text-sm font-semibold">
            ✓ 선택 완료 — 제한 시간 전까지 변경 가능
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
