import { MinorityButtonPublicState, MinorityButtonPrivateState, Player } from "../../../../../packages/shared/src/types.ts";

interface Props {
  publicState: MinorityButtonPublicState;
  privateState: MinorityButtonPrivateState | null;
  players: Player[];
  myPlayerId: string;
  timeLeft: number | null;
  isAlive: boolean;
  onSelect: (buttonId: string) => void;
}

export function MinorityButtonView({ publicState, privateState, players, myPlayerId, timeLeft, isAlive, onSelect }: Props) {
  const { buttons, submittedCount } = publicState;
  const mySelection = privateState?.mySelection ?? null;
  const alivePlayers = players.filter(p => p.isAlive);

  return (
    <div className="flex-grow flex flex-col gap-6" id="minority-button-panel">
      {/* 헤더 */}
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold" style={{ color: '#F97316' }}>가장 적은 선택은 탈락</h2>
        <p className="text-gray-400 text-sm">가장 적게 선택된 버튼을 고른 사람은 탈락</p>
        <div className="flex justify-center gap-4 text-sm mt-2">
          <span className="text-gray-400">선택 완료: <span className="text-white font-bold">{submittedCount} / {alivePlayers.length}명</span></span>
          {timeLeft !== null && (
            <span className={`font-bold ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-orange-400'}`}>
              ⏱ {timeLeft}초
            </span>
          )}
        </div>
      </div>

      {/* 관전자 안내 */}
      {!isAlive && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center text-gray-400">
          👁 관전 중 — 버튼을 선택할 수 없습니다
        </div>
      )}

      {/* 버튼 그리드 */}
      <div
        className="grid gap-4 mx-auto w-full max-w-md"
        style={{ gridTemplateColumns: `repeat(${Math.min(3, buttons.length)}, 1fr)` }}
        id="minority-button-grid"
      >
        {buttons.map(btn => {
          const isSelected = mySelection === btn.id;
          return (
            <button
              key={btn.id}
              id={`minority-btn-${btn.id}`}
              disabled={!isAlive}
              onClick={() => onSelect(btn.id)}
              className={[
                "rounded-2xl py-8 px-4 text-4xl font-black transition-all duration-200",
                "border-2 shadow-lg flex flex-col items-center gap-2",
                isAlive ? "hover:scale-105 active:scale-95 cursor-pointer" : "cursor-default opacity-50",
                isSelected
                  ? "scale-105 ring-4 ring-white/30"
                  : "opacity-80 hover:opacity-100"
              ].join(" ")}
              style={{
                backgroundColor: isSelected ? btn.color + '40' : btn.color + '20',
                borderColor: isSelected ? btn.color : btn.color + '60',
                color: btn.color,
                boxShadow: isSelected ? `0 0 20px ${btn.color}40` : undefined
              }}
            >
              <span className="text-3xl">{btn.label}</span>
              {isSelected && (
                <span className="text-xs font-normal text-white/70 text-center leading-tight">
                  ✓ 선택됨
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 선택 확인 */}
      {isAlive && mySelection !== null && (
        <div className="text-center mt-2 animate-fade-in">
          <span className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-2 text-orange-300 text-sm font-semibold">
            ✓ 선택 완료 — 제한 시간 전까지 변경 가능
          </span>
        </div>
      )}
    </div>
  );
}
