import { useState, useEffect } from "react";
import { useGame } from "./hooks/useGame.ts";
import {
  GameState, FinalChoice, Player,
  UniqueSlotPublicState, MinorityButtonPublicState,
  ShapeDeceptionPublicState, RpsPublicState,
  UniqueSlotPrivateState, MinorityButtonPrivateState,
  ShapeDeceptionPrivateState, RpsPrivateState
} from "../../../packages/shared/src/types.ts";
import { MinigameIntro } from "./components/minigames/MinigameIntro.tsx";
import { UniqueSlotView } from "./components/minigames/UniqueSlotView.tsx";
import { MinorityButtonView } from "./components/minigames/MinorityButtonView.tsx";
import { ShapeDeceptionView } from "./components/minigames/ShapeDeceptionView.tsx";
import { RockPaperScissorsView } from "./components/minigames/RockPaperScissorsView.tsx";
import { MinigameResultView } from "./components/minigames/MinigameResultView.tsx";

// ─────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────
const formatChoice = (c: string | null) => {
  if (c === "ROCK") return "바위";
  if (c === "PAPER") return "보";
  if (c === "SCISSORS") return "가위";
  return "미제출";
};

function useLocalTimer(endsAt: number | null, serverTimestamp?: number) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!endsAt) { setTimeLeft(null); return; }
    const drift = serverTimestamp ? serverTimestamp - Date.now() : 0;
    const update = () => {
      const nowAdjusted = Date.now() + drift;
      setTimeLeft(Math.max(0, Math.ceil((endsAt - nowAdjusted) / 1000)));
    };
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [endsAt, serverTimestamp]);
  return timeLeft;
}

// ─────────────────────────────────────────────
// 로비 / 대기실
// ─────────────────────────────────────────────
function LobbyView({
  room, me, nickname, setNickname, roomCodeInput, setRoomCodeInput,
  copied, setCopied, createRoom, joinRoom, toggleReady, startGame, leaveRoom
}: any) {
  const isNicknameValid = nickname.trim().length >= 2 && nickname.trim().length <= 12 && /^[a-zA-Z0-9가-힣\s-_]+$/.test(nickname);
  const handleCopyCode = async () => {
    if (!room?.roomCode) return;
    await navigator.clipboard.writeText(room.roomCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!room) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center gap-8 min-h-[60vh]">
        <div className="text-center space-y-2">
          <div className="text-6xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400">
            LAST CHOICE
          </div>
          <p className="text-gray-400 text-sm">심리 서바이벌 멀티플레이 게임</p>
        </div>

        <div className="w-full max-w-sm bg-dark-card border border-gray-800 rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">닉네임</label>
            <input
              id="nickname-input"
              type="text"
              placeholder="2~12자 닉네임"
              value={nickname}
              maxLength={12}
              onChange={e => setNickname(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-brand-cyan focus:outline-none focus:ring-1 focus:ring-brand-cyan transition-colors"
            />
          </div>

          <button
            id="create-room-btn"
            disabled={!isNicknameValid}
            onClick={() => createRoom(nickname.trim())}
            className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            방 만들기
          </button>

          <div className="flex gap-2">
            <input
              id="room-code-input"
              type="text"
              placeholder="방 코드 6자리"
              value={roomCodeInput}
              maxLength={6}
              onChange={e => setRoomCodeInput(e.target.value.toUpperCase())}
              className="flex-grow bg-gray-900 border border-gray-700 rounded-xl px-3 py-3 text-white placeholder-gray-600 text-sm uppercase tracking-widest focus:border-brand-cyan focus:outline-none transition-colors"
            />
            <button
              id="join-room-btn"
              disabled={!isNicknameValid || roomCodeInput.length !== 6}
              onClick={() => joinRoom(roomCodeInput.trim().toUpperCase(), nickname.trim())}
              className="px-4 py-3 rounded-xl font-bold text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              참가
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 방에 입장한 상태 (로비 대기)
  const myPlayer = room.players.find((p: Player) => p.id === me?.playerId);
  const nonHostPlayers = room.players.filter((p: Player) => !p.isHost);
  const allReady = nonHostPlayers.every((p: Player) => p.isReady);
  const canStart = room.players.filter((p: Player) => !p.disconnectedAt).length >= 2 && allReady;

  return (
    <div className="flex-grow flex flex-col gap-6" id="lobby-panel">
      {/* 방 정보 */}
      <div className="bg-dark-card border border-gray-800 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-semibold">방 코드</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-widest text-brand-cyan" id="room-code-display">{room.roomCode}</span>
            <button id="copy-code-btn" onClick={handleCopyCode} className="bg-brand-teal/20 text-brand-cyan hover:bg-brand-teal/40 text-xs px-2.5 py-1.5 rounded transition-colors">
              {copied ? '복사 완료!' : '코드 복사'}
            </button>
          </div>
        </div>
        <div className="text-center md:text-right">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-semibold">참가 인원</p>
          <p className="text-2xl font-bold">{room.players.length} / 9 명</p>
        </div>
      </div>

      {/* 플레이어 목록 */}
      <div className="bg-dark-card border border-gray-800 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">참가자</h3>
        <div id="player-list" className="space-y-2">
          {room.players.map((p: Player) => (
            <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-gray-900/50">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${p.disconnectedAt ? 'bg-gray-500' : 'bg-green-400'}`} />
                <span className="font-semibold text-white text-sm">{p.nickname}</span>
                {p.isHost && <span className="text-xs bg-brand-teal/20 text-brand-cyan px-2 py-0.5 rounded-full">방장</span>}
              </div>
              <span className={`text-xs font-semibold ${p.isReady ? 'text-green-400' : 'text-gray-500'}`}>
                {p.isReady ? '준비완료' : '대기 중'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 게임 규칙 미리보기 */}
      <div className="bg-dark-card border border-gray-800 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">미니게임 목록</h3>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          {[
            { emoji: '🎯', name: '혼자 골라야 산다', desc: '같은 번호를 선택한 사람은 탈락' },
            { emoji: '🔴', name: '가장 적은 선택은 탈락', desc: '가장 적게 선택된 버튼을 고른 사람은 탈락' },
            { emoji: '🔮', name: '진짜 모양을 찾아라', desc: '출제자의 말을 듣고 정답 모양을 선택' },
            { emoji: '⚔️', name: '최후의 선택', desc: '가위바위보 2점 선승으로 최종 우승자 결정' },
          ].map(g => (
            <div key={g.name} className="flex gap-3 bg-gray-900/50 rounded-xl p-3">
              <span className="text-xl">{g.emoji}</span>
              <div>
                <p className="font-semibold text-white text-xs">{g.name}</p>
                <p className="text-gray-500 text-xs">{g.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="flex gap-3">
        {myPlayer && !myPlayer.isHost && (
          <button
            id="toggle-ready-btn"
            onClick={toggleReady}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${myPlayer.isReady ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gradient-to-r from-green-500 to-teal-600 text-white hover:from-green-400'}`}
          >
            {myPlayer.isReady ? '준비 취소' : '준비 완료'}
          </button>
        )}
        {myPlayer?.isHost && (
          <button
            id="start-game-btn"
            disabled={!canStart}
            onClick={startGame}
            className="flex-1 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-brand-cyan to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            게임 시작 {!canStart && `(최소 2명, 모두 준비 필요)`}
          </button>
        )}
        <button onClick={leaveRoom} className="px-4 py-3 rounded-xl text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-all">
          나가기
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 게임 종료 화면
// ─────────────────────────────────────────────
function GameOverView({ room, me, players, minigameResults, playAgain, leaveRoom }: any) {
  const winner = room?.players.find((p: Player) => p.id === room.winnerId);
  const myPlayer = players.find((p: Player) => p.id === me?.playerId);
  const isWinner = myPlayer?.id === room.winnerId;

  return (
    <div className="flex-grow flex flex-col items-center justify-center gap-8 min-h-[60vh]" id="game-over-panel">
      <div className="text-center space-y-4 animate-fade-in">
        <div className="text-7xl">
          {isWinner ? '🏆' : '💀'}
        </div>
        <h2 className="text-4xl font-black">
          {isWinner ? '최종 우승!' : '게임 종료'}
        </h2>
        {winner && (
          <p className="text-xl text-gray-300">
            우승자: <span className="text-yellow-400 font-bold">{winner.nickname}</span>
          </p>
        )}
      </div>

      {/* 미니게임 이력 */}
      {minigameResults && minigameResults.length > 0 && (
        <div className="w-full max-w-md bg-dark-card border border-gray-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">게임 기록</h3>
          <div className="space-y-2">
            {minigameResults.map((r: any, i: number) => (
              <div key={r.instanceId} className="flex justify-between text-xs text-gray-300 bg-gray-900/50 rounded-xl px-4 py-3">
                <span className="text-gray-500">R{i + 1}</span>
                <span>{r.type === 'UNIQUE_SLOT' ? '🎯' : r.type === 'MINORITY_BUTTON' ? '🔴' : r.type === 'SHAPE_DECEPTION' ? '🔮' : '⚔️'}</span>
                <span className={r.isVoid ? 'text-yellow-400' : ''}>{r.publicSummary}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {myPlayer?.isHost && (
          <button
            id="play-again-btn"
            onClick={playAgain}
            className="px-8 py-3 rounded-xl font-bold bg-gradient-to-r from-brand-cyan to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 transition-all"
          >
            다시 플레이
          </button>
        )}
        <button onClick={leaveRoom} className="px-6 py-3 rounded-xl text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-all">
          나가기
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 메인 App 컴포넌트
// ─────────────────────────────────────────────
export default function App() {
  const {
    room, me, isConnected, error, clearError,
    createRoom, joinRoom, toggleReady, startGame,
    submitSelection, submitMinorityButton, submitShapeGuess,
    sendShapeChat, sendDrawingStrokes, clearDrawing,
    submitFinalChoice, leaveRoom, playAgain
  } = useGame();

  const [nickname, setNickname] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [copied, setCopied] = useState(false);

  const timeLeft = useLocalTimer(room?.roundEndsAt ?? null, room?.serverTimestamp);
  const myPlayer = room?.players.find(p => p.id === me?.playerId);
  const isAlive = myPlayer?.isAlive ?? false;

  const minigame = room?.currentMinigame ?? null;
  const minigamePrivate = me?.minigamePrivate ?? null;
  const instanceId = (minigame as any)?.instanceId ?? '';

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* 헤더 */}
      <header className="border-b border-gray-800 px-6 py-3 flex justify-between items-center">
        <div className="font-black text-lg tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-400">
          LAST CHOICE
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
          <span className="text-gray-400">{isConnected ? '연결됨' : '재연결 중...'}</span>
          {room && (
            <span className="ml-2 text-gray-500">
              {room.players.filter(p => p.isAlive).length}명 생존
              {room.gameState !== GameState.LOBBY && room.gameState !== GameState.GAME_OVER && (
                <span className="ml-2 text-brand-cyan">R{room.currentRound}</span>
              )}
            </span>
          )}
        </div>
      </header>

      {/* 오류 메시지 */}
      {error && (
        <div className="mx-6 mt-4 bg-red-900/30 border border-red-500/50 text-red-200 text-sm rounded-lg p-3 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={clearError} className="text-red-400 hover:text-red-200 text-lg">×</button>
        </div>
      )}

      {/* 메인 콘텐츠 */}
      <main className="flex-grow flex flex-col px-4 py-6 max-w-2xl mx-auto w-full">

        {/* 게임 상태별 렌더링 */}
        {(!room || room.gameState === GameState.LOBBY) && (
          <LobbyView
            room={room} me={me} nickname={nickname} setNickname={setNickname}
            roomCodeInput={roomCodeInput} setRoomCodeInput={setRoomCodeInput}
            copied={copied} setCopied={setCopied}
            createRoom={createRoom} joinRoom={joinRoom}
            toggleReady={toggleReady} startGame={startGame} leaveRoom={leaveRoom}
          />
        )}

        {/* 미니게임 인트로 */}
        {room?.gameState === GameState.MINIGAME_INTRO && room.minigameIntroInfo && (
          <MinigameIntro info={room.minigameIntroInfo} />
        )}

        {/* 미니게임 진행 중 */}
        {(room?.gameState === GameState.PLAYING || room?.gameState === GameState.FINAL_DUEL) && minigame && (
          <>
            {minigame.type === 'UNIQUE_SLOT' && (
              <UniqueSlotView
                publicState={minigame as UniqueSlotPublicState}
                privateState={minigamePrivate?.type === 'UNIQUE_SLOT' ? minigamePrivate as UniqueSlotPrivateState : null}
                players={room.players}
                myPlayerId={me?.playerId ?? ''}
                timeLeft={timeLeft}
                isAlive={isAlive}
                onSelect={slot => submitSelection(slot, (minigame as any).instanceId)}
              />
            )}
            {minigame.type === 'MINORITY_BUTTON' && (
              <MinorityButtonView
                publicState={minigame as MinorityButtonPublicState}
                privateState={minigamePrivate?.type === 'MINORITY_BUTTON' ? minigamePrivate as MinorityButtonPrivateState : null}
                players={room.players}
                myPlayerId={me?.playerId ?? ''}
                timeLeft={timeLeft}
                isAlive={isAlive}
                onSelect={buttonId => submitMinorityButton(buttonId, (minigame as any).instanceId)}
              />
            )}
            {minigame.type === 'SHAPE_DECEPTION' && (
              <ShapeDeceptionView
                publicState={minigame as ShapeDeceptionPublicState}
                privateState={minigamePrivate?.type === 'SHAPE_DECEPTION' ? minigamePrivate as ShapeDeceptionPrivateState : null}
                players={room.players}
                myPlayerId={me?.playerId ?? ''}
                timeLeft={timeLeft}
                isAlive={isAlive}
                instanceId={(minigame as any).instanceId ?? ''}
                onSelectOption={optionId => submitShapeGuess(optionId, (minigame as any).instanceId)}
                onSendChat={msg => sendShapeChat(msg, (minigame as any).instanceId)}
                onSendStrokes={strokes => sendDrawingStrokes(strokes, (minigame as any).instanceId)}
                onClearDrawing={() => clearDrawing((minigame as any).instanceId)}
              />
            )}
            {minigame.type === 'ROCK_PAPER_SCISSORS' && (
              // 가위바위보는 아래 전용 블록에서 처리하므로 여기선 빈 태그
              null
            )}
          </>
        )}

        {/* 결승전 (가위바위보): 대기/선택(FINAL_DUEL), 공개 중(REVEALING), 결과(MINIGAME_RESULT) 모두 이 전용 뷰에서 처리 */}
        {((room?.gameState === GameState.FINAL_DUEL) ||
          ((room?.gameState === GameState.REVEALING || room?.gameState === GameState.MINIGAME_RESULT) && minigame?.type === 'ROCK_PAPER_SCISSORS')) && minigame && (
          <RockPaperScissorsView
            publicState={minigame as RpsPublicState}
            privateState={minigamePrivate?.type === 'ROCK_PAPER_SCISSORS' ? minigamePrivate as RpsPrivateState : null}
            players={room.players}
            myPlayerId={me?.playerId ?? ''}
            timeLeft={timeLeft}
            isAlive={isAlive}
            gameState={room.gameState}
            finalDuelResults={room.finalDuelResults}
            onSelect={choice => submitFinalChoice(choice, (minigame as any).instanceId)}
          />
        )}

        {/* 결과 공개 중 (일반 미니게임) */}
        {room?.gameState === GameState.REVEALING && minigame && minigame.type !== 'ROCK_PAPER_SCISSORS' && (
          <div id="revealing-panel" className="flex-grow flex flex-col items-center justify-center gap-4">
            <div className="text-5xl animate-bounce">⏳</div>
            <p className="text-xl font-bold text-gray-300">결과 공개 중...</p>
            {room.minigameResults.length > 0 && (
              <div className="w-full max-w-md mt-4">
                <MinigameResultView
                  result={room.minigameResults[room.minigameResults.length - 1]}
                  players={room.players}
                />
              </div>
            )}
          </div>
        )}

        {/* 미니게임 결과 (일반 미니게임) */}
        {room?.gameState === GameState.MINIGAME_RESULT && room.minigameResults.length > 0 && minigame?.type !== 'ROCK_PAPER_SCISSORS' && (
          <MinigameResultView
            result={room.minigameResults[room.minigameResults.length - 1]}
            players={room.players}
          />
        )}

        {/* 게임 종료 */}
        {room?.gameState === GameState.GAME_OVER && (
          <GameOverView
            room={room} me={me}
            players={room.players}
            minigameResults={room.minigameResults}
            playAgain={playAgain}
            leaveRoom={leaveRoom}
          />
        )}
      </main>
    </div>
  );
}
