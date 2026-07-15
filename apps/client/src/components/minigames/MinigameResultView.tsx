import { MinigameResultRecord, Player, MinigameType } from "../../../../../packages/shared/src/types.ts";

interface Props {
  result: MinigameResultRecord;
  players: Player[];
}

const TYPE_LABELS: Record<MinigameType, string> = {
  UNIQUE_SLOT: '혼자 골라야 산다',
  MINORITY_BUTTON: '가장 적은 선택은 탈락',
  SHAPE_DECEPTION: '진짜 모양을 찾아라',
  ROCK_PAPER_SCISSORS: '최후의 선택'
};

const TYPE_COLORS: Record<MinigameType, string> = {
  UNIQUE_SLOT: 'from-cyan-500/10 to-blue-600/10 border-cyan-500/30',
  MINORITY_BUTTON: 'from-orange-500/10 to-red-600/10 border-orange-500/30',
  SHAPE_DECEPTION: 'from-violet-500/10 to-purple-600/10 border-violet-500/30',
  ROCK_PAPER_SCISSORS: 'from-yellow-500/10 to-amber-600/10 border-yellow-500/30'
};

export function MinigameResultView({ result, players }: Props) {
  const survivorPlayers = players.filter(p => result.survivors.includes(p.id));
  const eliminatedPlayers = players.filter(p => result.eliminated.includes(p.id));

  return (
    <div
      id="minigame-result-panel"
      className={`flex-grow flex flex-col gap-6 bg-gradient-to-br ${TYPE_COLORS[result.type]} border rounded-2xl p-6`}
    >
      <div className="text-center space-y-1">
        <p className="text-xs text-gray-400 uppercase tracking-widest">{TYPE_LABELS[result.type]} — 결과</p>
        <h2 className="text-2xl font-black">
          {result.isVoid ? '⚠️ 무효 처리' : '📊 라운드 결과'}
        </h2>
        <p className="text-gray-300 text-sm">{result.publicSummary}</p>
      </div>

      {result.isVoid && (
        <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-xl p-4 text-center">
          <p className="text-yellow-300 font-semibold">{result.voidReason}</p>
          <p className="text-yellow-400/70 text-sm mt-1">모든 플레이어가 생존합니다</p>
        </div>
      )}

      {!result.isVoid && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* 생존자 */}
          <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-4">
            <h3 className="text-green-400 font-bold text-sm uppercase tracking-wide mb-3">
              ✅ 생존 ({survivorPlayers.length}명)
            </h3>
            <div className="space-y-2">
              {survivorPlayers.map(p => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-white font-semibold text-sm">{p.nickname}</span>
                </div>
              ))}
              {survivorPlayers.length === 0 && (
                <p className="text-gray-500 text-sm">생존자 없음</p>
              )}
            </div>
          </div>

          {/* 탈락자 */}
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
            <h3 className="text-red-400 font-bold text-sm uppercase tracking-wide mb-3">
              ❌ 탈락 ({eliminatedPlayers.length}명)
            </h3>
            <div className="space-y-2">
              {eliminatedPlayers.map(p => (
                <div key={p.id} className="flex items-center gap-2 opacity-60">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-gray-300 text-sm line-through">{p.nickname}</span>
                </div>
              ))}
              {eliminatedPlayers.length === 0 && (
                <p className="text-gray-500 text-sm">탈락자 없음</p>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-gray-500 text-xs animate-pulse">
        잠시 후 다음 미니게임으로 넘어갑니다...
      </p>
    </div>
  );
}
