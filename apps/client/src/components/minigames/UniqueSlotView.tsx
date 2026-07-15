import { useState, useEffect } from "react";
import { UniqueSlotPublicState, UniqueSlotPrivateState, Player } from "../../../../../packages/shared/src/types.ts";

interface Props {
  publicState: UniqueSlotPublicState;
  privateState: UniqueSlotPrivateState | null;
  players: Player[];
  myPlayerId: string;
  timeLeft: number | null;
  isAlive: boolean;
  onSelect: (slot: number) => void;
}

export function UniqueSlotView({ publicState, privateState, players, myPlayerId, timeLeft, isAlive, onSelect }: Props) {
  const { slotCount, submittedCount } = publicState;
  const mySelection = privateState?.mySelection ?? null;
  const alivePlayers = players.filter(p => p.isAlive);

  const cols = slotCount <= 3 ? slotCount : slotCount <= 6 ? 3 : 3;

  return (
    <div className="flex-grow flex flex-col gap-6" id="unique-slot-panel">
      {/* 헤더 */}
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-brand-cyan">혼자 골라야 산다</h2>
        <p className="text-gray-400 text-sm">같은 칸을 고른 사람은 모두 탈락</p>
        <div className="flex justify-center gap-4 text-sm mt-2">
          <span className="text-gray-400">선택 완료: <span className="text-white font-bold">{submittedCount} / {alivePlayers.length}명</span></span>
          {timeLeft !== null && (
            <span className={`font-bold ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-brand-cyan'}`}>
              ⏱ {timeLeft}초
            </span>
          )}
        </div>
      </div>

      {/* 관전자 안내 */}
      {!isAlive && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center text-gray-400">
          👁 관전 중 — 번호를 선택할 수 없습니다
        </div>
      )}

      {/* 번호 그리드 */}
      <div
        className="grid gap-4 mx-auto w-full max-w-sm"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        id="slot-grid"
      >
        {Array.from({ length: slotCount }, (_, i) => i + 1).map(slot => {
          const isSelected = mySelection === slot;
          return (
            <button
              key={slot}
              id={`slot-${slot}`}
              disabled={!isAlive}
              onClick={() => onSelect(slot)}
              className={[
                "aspect-square rounded-2xl text-3xl font-black transition-all duration-200 select-none",
                "border-2 shadow-lg",
                isAlive ? "hover:scale-105 active:scale-95 cursor-pointer" : "cursor-default opacity-50",
                isSelected
                  ? "bg-brand-cyan/20 border-brand-cyan text-brand-cyan shadow-cyan-500/30 scale-105"
                  : "bg-dark-card border-gray-700 text-gray-200 hover:border-gray-500"
              ].join(" ")}
            >
              {slot}
            </button>
          );
        })}
      </div>

      {/* 선택 확인 */}
      {isAlive && mySelection !== null && (
        <div className="text-center mt-2 animate-fade-in">
          <span className="inline-flex items-center gap-2 bg-brand-cyan/10 border border-brand-cyan/30 rounded-full px-4 py-2 text-brand-cyan text-sm font-semibold">
            ✓ {mySelection}번 선택 완료 — 제한 시간 전까지 변경 가능
          </span>
        </div>
      )}
    </div>
  );
}
