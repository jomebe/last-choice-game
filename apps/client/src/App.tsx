import { useState, useEffect } from "react";
import { useGame } from "./hooks/useGame.ts";
import { GameState, FinalChoice, Player } from "../../../packages/shared/src/types.ts";

const ROCK_SVG = (className = "w-12 h-12") => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 10a2 2 0 0 0-2 2v3a2 2 0 0 0 4 0v-3a2 2 0 0 0-2-2z" />
    <path d="M10 12V8a2 2 0 0 0-4 0v7a6 6 0 0 0 12 0v-3a2 2 0 0 0-4 0v3" />
    <path d="M6 14h12" />
  </svg>
);

const PAPER_SVG = (className = "w-12 h-12") => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a2 2 0 1 1 4 0v7a10 10 0 0 1-20 0V8a2 2 0 1 1 4 0v4" />
    <path d="M6 10V6a2 2 0 1 1 4 0v6" />
    <path d="M10 10V5a2 2 0 1 1 4 0v5" />
    <path d="M14 10V7a2 2 0 1 1 4 0v5" />
  </svg>
);

const SCISSORS_SVG = (className = "w-12 h-12") => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="9.8" y1="8.5" x2="20" y2="17" />
    <line x1="9.8" y1="15.5" x2="20" y2="7" />
  </svg>
);

const formatChoice = (c: string | null) => {
  if (c === "ROCK") return "바위";
  if (c === "PAPER") return "보";
  if (c === "SCISSORS") return "가위";
  return "미제출";
};

export default function App() {
  const {
    room,
    me,
    isConnected,
    error,
    clearError,
    createRoom,
    joinRoom,
    toggleReady,
    startGame,
    submitSelection,
    submitFinalChoice,
    leaveRoom,
    playAgain
  } = useGame();

  const [nickname, setNickname] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localTimeLeft, setLocalTimeLeft] = useState<number | null>(null);

  // 닉네임 유효성 검사
  const isNicknameValid = nickname.trim().length >= 2 && nickname.trim().length <= 12 && /^[a-zA-Z0-9가-힣\s-_]+$/.test(nickname);

  // 로컬 타이머 갱신 (서버 roundEndsAt 기준)
  useEffect(() => {
    if (!room || !room.roundEndsAt) {
      setLocalTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const diff = room.roundEndsAt! - Date.now();
      if (diff <= 0) {
        setLocalTimeLeft(0);
      } else {
        setLocalTimeLeft(Math.ceil(diff / 1000));
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 200);

    return () => clearInterval(interval);
  }, [room?.roundEndsAt, room?.gameState]);

  // 방 코드 복사 핸들러
  const handleCopyCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 1. 시작 화면
  if (!room || !me) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 relative" id="start-screen">
        {/* 장식용 그리드 배경 */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-35 pointer-events-none" />

        <div className="w-full max-w-md bg-dark-card border border-gray-800 rounded-2xl p-6 md:p-8 shadow-2xl relative z-10">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-extrabold tracking-wider font-['Outfit'] bg-gradient-to-r from-brand-cyan via-brand-teal to-white bg-clip-text text-transparent mb-2">
              LAST CHOICE
            </h1>
            <p className="text-gray-400 text-sm font-light">
              실시간 멀티플레이 고유 칸 서바이벌
            </p>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-500/50 text-red-200 text-sm rounded-lg p-3 mb-4 flex justify-between items-center" id="error-alert">
              <span>{error}</span>
              <button onClick={clearError} className="text-red-400 hover:text-red-200 text-lg">&times;</button>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">닉네임</label>
              <input
                id="nickname-input"
                type="text"
                maxLength={12}
                placeholder="2-12자 한글/영문/숫자"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full bg-dark-bg border border-gray-700 focus:border-brand-cyan focus:outline-none rounded-lg px-4 py-3 text-white transition-all"
              />
            </div>

            <div className="h-px bg-gray-800 my-6" />

            <div className="space-y-2">
              <button
                id="create-room-btn"
                disabled={!isNicknameValid}
                onClick={() => createRoom(nickname)}
                className="w-full bg-gradient-to-r from-brand-cyan to-brand-teal text-black font-bold py-3 px-4 rounded-lg hover:shadow-[0_0_15px_#66FCF1] disabled:opacity-40 disabled:hover:shadow-none transition-all duration-300"
              >
                방 만들기 (Host)
              </button>
            </div>

            <div className="flex items-center my-4">
              <div className="flex-grow h-px bg-gray-800" />
              <span className="px-3 text-xs text-gray-500 font-semibold uppercase">또는</span>
              <div className="flex-grow h-px bg-gray-800" />
            </div>

            <div className="space-y-3">
              <input
                id="room-code-input"
                type="text"
                placeholder="6자리 방 코드 입력"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                className="w-full bg-dark-bg border border-gray-700 focus:border-brand-cyan focus:outline-none rounded-lg px-4 py-3 text-center tracking-widest text-white transition-all"
              />
              <button
                id="join-room-btn"
                disabled={!isNicknameValid || roomCodeInput.length !== 6}
                onClick={() => joinRoom(roomCodeInput, nickname)}
                className="w-full bg-transparent border border-brand-cyan text-brand-cyan hover:bg-brand-cyan/10 font-bold py-3 px-4 rounded-lg disabled:opacity-40 disabled:hover:bg-transparent transition-all"
              >
                방 참가하기
              </button>
            </div>
          </div>

          <div className="text-center mt-6">
            <button
              onClick={() => setShowRules(true)}
              className="text-xs text-gray-500 hover:text-brand-cyan transition-colors underline"
            >
              게임 규칙 확인하기
            </button>
          </div>
        </div>

        {/* 규칙 모달 */}
        {showRules && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" id="rules-modal">
            <div className="bg-dark-card border border-gray-800 rounded-2xl max-w-md p-6 relative w-full text-left">
              <h3 className="text-xl font-bold text-brand-cyan mb-4">LAST CHOICE 게임 규칙</h3>
              <div className="space-y-3 text-sm text-gray-300 overflow-y-auto max-h-[60vh] pr-2">
                <p>1. **고유 생존**: 매 라운드 1부터 생존자 수와 동일한 숫자의 번호 칸이 제시됩니다.</p>
                <p>2. **비공개 선택**: 플레이어는 원하는 칸을 비공개로 클릭합니다. 라운드가 끝나기 전까지 다른 유저가 낸 선택은 알 수 없습니다.</p>
                <p>3. **탈락과 생존**:
                  <br /> - 단 **한 명만** 선택한 칸의 플레이어는 **생존**합니다.
                  <br /> - **두 명 이상**이 중복 선택한 칸의 플레이어는 모두 **탈락**합니다.
                  <br /> - 제한시간 내에 선택하지 않은 플레이어도 **탈락**합니다.
                </p>
                <p>4. **전원 탈락 시 복구**: 만약 생존자가 0명이 되면 해당 라운드는 무효 처리되며 직전 인원으로 재경기를 시작합니다. (3회 연속 전원 탈락 시 칸이 1개 추가됩니다)</p>
                <p>5. **결승전 (2인)**: 생존자가 정확히 2명이 되거나 2명으로 게임을 시작하면 즉시 결승전에 진입합니다.
                  <br /> - 결승전은 삼상성 심볼(검은 원, 흰 삼각형, 붉은 사각형) 심리전으로 3판 2선승제로 최종 우승자를 결정합니다.
                  <br /> - **검은 원**은 흰 삼각형을 이깁니다.
                  <br /> - **흰 삼각형**은 붉은 사각형을 이깁니다.
                  <br /> - **붉은 사각형**은 검은 원을 이깁니다.
                </p>
              </div>
              <button
                onClick={() => setShowRules(false)}
                className="mt-6 w-full bg-brand-teal text-white font-bold py-2 rounded-lg hover:bg-brand-teal/80 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. 게임 방 상태 뷰어 공통 헤더
  const myPlayerInfo = room.players.find(p => p.id === me.playerId)!;
  const isAlive = myPlayerInfo?.isAlive;
  const isHost = myPlayerInfo?.isHost;

  return (
    <div className="min-h-screen flex flex-col text-white max-w-4xl mx-auto p-4 md:p-6" id="game-view">
      {/* 상단 헬퍼 바 */}
      <div className="flex justify-between items-center border-b border-gray-800 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-wider text-brand-cyan">LAST CHOICE</span>
          <span className={`text-xs px-2 py-1 rounded ${isConnected ? "bg-green-900/30 text-green-400 border border-green-500/30" : "bg-red-900/30 text-red-400 border border-red-500/30"}`}>
            {isConnected ? "연결됨" : "연결 끊김"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-400">
            {myPlayerInfo ? `${myPlayerInfo.nickname} (${isAlive ? "생존" : "관전"})` : ""}
          </span>
          <button
            id="leave-room-btn"
            onClick={leaveRoom}
            className="text-xs border border-red-500/50 hover:bg-red-500/10 text-red-400 px-3 py-1.5 rounded transition-all"
          >
            방 나가기
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 text-red-200 text-sm rounded-lg p-3 mb-4 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={clearError} className="text-red-400 hover:text-red-200 text-lg">&times;</button>
        </div>
      )}

      {/* --- LOBBY 화면 --- */}
      {room.gameState === GameState.LOBBY && (
        <div className="flex-grow flex flex-col gap-6" id="lobby-panel">
          <div className="bg-dark-card border border-gray-800 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-semibold">방 코드</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold tracking-widest text-brand-cyan" id="room-code-display">{room.roomCode}</span>
                <button
                  id="copy-code-btn"
                  onClick={handleCopyCode}
                  className="bg-brand-teal/20 text-brand-cyan hover:bg-brand-teal/40 text-xs px-2.5 py-1.5 rounded transition-colors"
                >
                  {copied ? "복사 완료!" : "코드 복사"}
                </button>
              </div>
            </div>
            <div className="text-center md:text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-semibold">참가 인원</p>
              <p className="text-2xl font-bold">{room.players.length} / 9 명</p>
            </div>
          </div>

          <div className="bg-dark-card border border-gray-800 rounded-2xl p-6 flex-grow">
            <h2 className="text-lg font-bold mb-4 border-b border-gray-800 pb-2">대기 중인 플레이어 목록</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="player-list">
              {room.players.map((p) => (
                <div
                  key={p.id}
                  className={`flex justify-between items-center p-3 rounded-lg border ${
                    p.id === me.playerId ? "border-brand-cyan bg-brand-cyan/5" : "border-gray-800 bg-black/20"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{p.nickname}</span>
                    {p.isHost && (
                      <span className="bg-brand-yellow/20 text-brand-yellow border border-brand-yellow/30 text-[10px] px-1.5 py-0.5 rounded uppercase font-bold">
                        Host
                      </span>
                    )}
                    {p.disconnectedAt !== null && (
                      <span className="bg-red-900/30 text-red-400 border border-red-500/20 text-[10px] px-1.5 py-0.5 rounded font-bold animate-pulse">
                        오프라인
                      </span>
                    )}
                  </div>
                  <div>
                    {p.isHost ? (
                      <span className="text-brand-cyan text-xs font-semibold">시작 권한</span>
                    ) : (
                      <span className={`text-xs px-2 py-1 rounded font-bold ${
                        p.isReady 
                          ? "bg-green-950 text-green-400 border border-green-500/30" 
                          : "bg-gray-800 text-gray-400 border border-gray-700/50"
                      }`}>
                        {p.isReady ? "준비완료" : "대기중"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-4 mt-4">
            {isHost ? (
              <button
                id="start-game-btn"
                disabled={
                  room.players.length < 2 || 
                  !room.players.filter(p => !p.isHost).every(p => p.isReady)
                }
                onClick={startGame}
                className="w-full md:w-auto bg-gradient-to-r from-brand-cyan to-brand-teal text-black font-bold py-3 px-8 rounded-lg hover:shadow-[0_0_15px_#66FCF1] disabled:opacity-40 disabled:hover:shadow-none transition-all duration-300"
              >
                게임 시작
              </button>
            ) : (
              <button
                id="toggle-ready-btn"
                onClick={toggleReady}
                className={`w-full md:w-auto font-bold py-3 px-8 rounded-lg border transition-all ${
                  myPlayerInfo?.isReady 
                    ? "bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800" 
                    : "bg-brand-cyan border-brand-cyan text-black hover:shadow-[0_0_15px_#66FCF1]"
                }`}
              >
                {myPlayerInfo?.isReady ? "준비 해제" : "준비 완료"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* --- COUNTDOWN 화면 --- */}
      {room.gameState === GameState.COUNTDOWN && (
        <div className="flex-grow flex flex-col items-center justify-center gap-6" id="countdown-panel">
          <p className="text-gray-400 uppercase tracking-widest text-sm font-semibold">곧 게임이 시작됩니다</p>
          <div className="text-8xl font-black font-['Outfit'] animate-ping text-brand-cyan">
            READY
          </div>
          <p className="text-xs text-gray-500">라운드 시작 카운트다운 중...</p>
        </div>
      )}

      {/* --- SELECTING 화면 (일반 라운드 선택) --- */}
      {room.gameState === GameState.SELECTING && (
        <div className="flex-grow flex flex-col gap-6" id="selecting-panel">
          <div className="bg-dark-card border border-gray-800 rounded-2xl p-4 md:p-6 flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">라운드</p>
              <h2 className="text-xl font-black">{room.currentRound} ROUND</h2>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">생존자 / 전체</p>
              <p className="text-xl font-bold text-brand-cyan">
                {room.players.filter(p => p.isAlive).length} / {room.players.length}명
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">남은 시간</p>
              <span className={`text-xl font-black ${localTimeLeft !== null && localTimeLeft <= 5 ? "text-brand-red animate-pulse" : "text-brand-yellow"}`}>
                {localTimeLeft !== null ? `${localTimeLeft}초` : "--초"}
              </span>
            </div>
          </div>

          {/* 타이머 바 */}
          <div className="w-full bg-gray-800 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-200 ${localTimeLeft !== null && localTimeLeft <= 5 ? "bg-brand-red" : "bg-brand-cyan"}`}
              style={{
                width: room.roundStartedAt && room.roundEndsAt
                  ? `${Math.max(0, Math.min(100, ((room.roundEndsAt - Date.now()) / (room.roundEndsAt - room.roundStartedAt)) * 100))}%`
                  : "100%"
              }}
            />
          </div>

          <div className="bg-dark-card border border-gray-800 rounded-2xl p-6 flex-grow flex flex-col items-center justify-center gap-6">
            <div className="text-center">
              <h3 className="text-lg font-bold mb-1">숫자 칸 선택</h3>
              <p className="text-xs text-gray-400">
                {isAlive 
                  ? "단 한 명만 고를 수 있는 고유 번호를 비공개로 클릭하세요." 
                  : "관전 중입니다. 플레이어들이 선택을 마칠 때까지 기다려 주세요."}
              </p>
              <p className="text-sm font-semibold text-brand-teal mt-2">
                선택 완료 인원: {room.submittedCount} / {room.players.filter(p => p.isAlive).length}명
              </p>
            </div>

            {/* 그리드 뷰포트 배치 */}
            <div 
              className="grid gap-4 w-full max-w-lg mt-4" 
              style={{ 
                gridTemplateColumns: room.selectableSlotCount === 9 
                  ? "repeat(3, minmax(0, 1fr))" 
                  : "repeat(auto-fit, minmax(80px, 1fr))"
              }}
              id="slot-grid"
            >
              {Array.from({ length: room.selectableSlotCount }, (_, idx) => idx + 1).map((slotNum) => {
                const isSelected = me.currentSelection === slotNum;
                return (
                  <button
                    key={slotNum}
                    disabled={!isAlive}
                    onClick={() => submitSelection(slotNum)}
                    className={`h-20 md:h-24 rounded-xl flex flex-col items-center justify-center border font-bold text-2xl relative transition-all duration-300 ${
                      !isAlive 
                        ? "border-gray-800 bg-gray-900/20 text-gray-600 cursor-not-allowed" 
                        : isSelected
                          ? "border-brand-cyan bg-brand-cyan/20 text-brand-cyan shadow-[0_0_15px_rgba(102,252,241,0.4)]"
                          : "border-gray-700 bg-black/30 text-gray-300 hover:border-brand-teal hover:bg-black/50"
                    }`}
                  >
                    <span>{slotNum}</span>
                    {isSelected && (
                      <span className="absolute bottom-2 text-[10px] tracking-wider uppercase font-semibold text-brand-cyan animate-pulse">
                        선택됨
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* --- REVEALING 화면 (순차 공개 연출) --- */}
      {room.gameState === GameState.REVEALING && (
        <div className="flex-grow flex flex-col gap-6" id="revealing-panel">
          <div className="bg-dark-card border border-gray-800 rounded-2xl p-6 text-center">
            <h2 className="text-xl font-bold tracking-widest text-brand-yellow animate-pulse uppercase">결과 공개 중</h2>
            <p className="text-xs text-gray-400 mt-1">곧 라운드 결과를 확정합니다...</p>
          </div>

          <div className="bg-dark-card border border-gray-800 rounded-2xl p-6 flex-grow flex flex-col items-center justify-center">
            <div className="text-center mb-6">
              <p className="text-xs text-gray-500 font-semibold">각 칸별 선택 집계</p>
            </div>
            
            {/* 공개 연출 보드 */}
            <div 
              className="grid gap-4 w-full max-w-lg"
              style={{ 
                gridTemplateColumns: room.selectableSlotCount === 9 
                  ? "repeat(3, minmax(0, 1fr))" 
                  : "repeat(auto-fit, minmax(80px, 1fr))"
              }}
            >
              {Array.from({ length: room.selectableSlotCount }, (_, idx) => idx + 1).map((slotNum) => {
                // 이 라운드의 최종 선택 정보들 구하기
                const roundRes = room.roundResults[room.roundResults.length - 1];
                const selectionsForSlot = roundRes?.selections.filter(sel => sel.slotSelected === slotNum) || [];
                const selectionCount = selectionsForSlot.length;

                let displayClass = "border-gray-800 bg-gray-900/10 text-gray-500";
                let statusLabel = "";

                if (selectionCount === 1) {
                  // 혼자 선택 -> 생존
                  displayClass = "border-brand-cyan bg-brand-cyan/10 text-brand-cyan glow-cyan-filter animate-pulse-slow";
                  statusLabel = "생존";
                } else if (selectionCount > 1) {
                  // 중복 선택 -> 폭발
                  displayClass = "border-brand-red bg-brand-red/10 text-brand-red glow-red-filter animate-shake";
                  statusLabel = "폭발";
                }

                return (
                  <div
                    key={slotNum}
                    className={`h-24 rounded-xl flex flex-col items-center justify-center border font-bold relative transition-all duration-500 ${displayClass}`}
                  >
                    <span className="text-2xl">{slotNum}</span>
                    {selectionCount > 0 && (
                      <div className="text-center mt-1">
                        <span className="text-[10px] block opacity-85">{selectionsForSlot.map(s => s.nickname).join(", ")}</span>
                        <span className="text-[9px] font-bold block tracking-wider uppercase mt-0.5">{statusLabel} ({selectionCount}명)</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* --- ROUND_RESULT 화면 (라운드 끝 결과 대기) --- */}
      {room.gameState === GameState.ROUND_RESULT && (
        room.finalDuelResults.length > 0 && room.players.filter(p => p.isAlive).length <= 2 ? (
          <div className="flex-grow flex flex-col gap-6" id="round-result-panel">
            <div className="bg-dark-card border border-gray-800 rounded-2xl p-6 text-center">
              <h2 className="text-3xl font-extrabold tracking-widest font-['Outfit'] bg-gradient-to-r from-brand-red to-brand-yellow bg-clip-text text-transparent mb-1">
                ROUND RESULT
              </h2>
              <p className="text-xs text-gray-400">결승전 매치 결과 공개</p>
            </div>

            {/* 공개된 가위바위보 카드 매치 */}
            {(() => {
              const lastRes = room.finalDuelResults[room.finalDuelResults.length - 1];
              const p1 = room.players.filter(p => p.isAlive)[0];
              const p2 = room.players.filter(p => p.isAlive)[1];
              
              const choice1 = lastRes.p1Selection;
              const choice2 = lastRes.p2Selection;
              
              const getChoiceIcon = (choice: string | null) => {
                if (choice === "ROCK") return ROCK_SVG("w-20 h-20 text-brand-cyan");
                if (choice === "PAPER") return PAPER_SVG("w-20 h-20 text-brand-cyan");
                if (choice === "SCISSORS") return SCISSORS_SVG("w-20 h-20 text-brand-cyan");
                return <span className="text-sm font-bold text-gray-500">선택 안 함</span>;
              };

              let statusText = "무승부";
              if (lastRes.winnerId) {
                const winPlayer = room.players.find(p => p.id === lastRes.winnerId);
                statusText = winPlayer ? `${winPlayer.nickname} 승리!` : "결과 판정 완료";
              }

              return (
                <div className="bg-dark-card border border-gray-800 rounded-2xl p-8 flex-grow flex flex-col items-center justify-center gap-8">
                  <div className="flex items-center justify-center gap-12 w-full max-w-lg">
                    {/* P1 카드 */}
                    <div className="flex flex-col items-center gap-3 flex-1 text-center">
                      <p className="text-xs text-gray-500 font-semibold uppercase">{p1?.nickname || "PLAYER 1"}</p>
                      <div className="w-32 h-32 bg-black/40 border border-gray-800 rounded-2xl flex items-center justify-center shadow-lg">
                        {getChoiceIcon(choice1)}
                      </div>
                      <span className="text-sm font-black text-gray-300">{formatChoice(choice1)}</span>
                    </div>

                    {/* VS */}
                    <div className="text-2xl font-black text-brand-red bg-brand-red/10 border border-brand-red/20 px-4 py-2 rounded-full">
                      VS
                    </div>

                    {/* P2 카드 */}
                    <div className="flex flex-col items-center gap-3 flex-1 text-center">
                      <p className="text-xs text-gray-500 font-semibold uppercase">{p2?.nickname || "PLAYER 2"}</p>
                      <div className="w-32 h-32 bg-black/40 border border-gray-800 rounded-2xl flex items-center justify-center shadow-lg">
                        {getChoiceIcon(choice2)}
                      </div>
                      <span className="text-sm font-black text-gray-300">{formatChoice(choice2)}</span>
                    </div>
                  </div>

                  <div className="text-center mt-4">
                    <h3 className="text-3xl font-black text-brand-yellow tracking-wide animate-pulse">{statusText}</h3>
                    <p className="text-xs text-gray-400 mt-2">잠시 후 다음 라운드가 시작됩니다...</p>
                  </div>

                  {/* 실시간 점수 별표 현황 */}
                  <div className="grid grid-cols-2 gap-8 w-full max-w-sm mt-4 border-t border-gray-800/60 pt-6">
                    {[p1, p2].filter(Boolean).map((p, index) => {
                      const scoreStars = Array.from({ length: 2 }).map((_, i) => i < p.score);
                      return (
                        <div key={p.id} className="text-center">
                          <p className="text-xs text-gray-400 font-bold">{p.nickname}</p>
                          <div className="flex justify-center gap-1 mt-1.5">
                            {scoreStars.map((earned, i) => (
                              <span key={i} className={`text-xl ${earned ? "text-brand-yellow animate-bounce" : "text-gray-700"}`}>
                                ★
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="flex-grow flex flex-col gap-6" id="round-result-panel">
            <div className="bg-dark-card border border-gray-800 rounded-2xl p-6 text-center">
              <h2 className="text-2xl font-black text-brand-cyan mb-2">ROUND RESULT</h2>
              <p className="text-xs text-gray-400">잠시 후 다음 라운드가 시작됩니다.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-grow">
              <div className="bg-dark-card border border-gray-800 rounded-2xl p-6">
                <h3 className="text-sm font-bold border-b border-gray-800 pb-2 mb-4 text-brand-cyan">생존자 목록</h3>
                <div className="space-y-2">
                  {room.players.filter(p => p.isAlive).map(p => (
                    <div key={p.id} className="flex justify-between items-center bg-green-950/20 border border-green-500/20 p-3 rounded-lg text-green-400">
                      <span className="font-semibold">{p.nickname}</span>
                      <span className="text-xs font-bold uppercase tracking-wider">생존</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-dark-card border border-gray-800 rounded-2xl p-6">
                <h3 className="text-sm font-bold border-b border-gray-800 pb-2 mb-4 text-brand-red">탈락자 목록</h3>
                <div className="space-y-2">
                  {room.players.filter(p => !p.isAlive).map(p => (
                    <div key={p.id} className="flex justify-between items-center bg-red-950/20 border border-red-500/20 p-3 rounded-lg text-red-400">
                      <span className="font-semibold">{p.nickname}</span>
                      <span className="text-xs font-bold uppercase tracking-wider">탈락</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* 전원 탈락 3회 규칙 및 연속 횟수 알림 */}
            {room.consecutiveWipeCount > 0 && (
              <div className="bg-brand-red/10 border border-brand-red/40 p-4 rounded-xl text-center text-sm font-semibold">
                ⚠️ 전원 탈락 발생! 연속 탈락 횟수: <span className="text-brand-red">{room.consecutiveWipeCount}회</span>
                {room.consecutiveWipeCount >= 3 ? " (다음 판에서 칸 수가 1개 증가합니다!)" : ""}
              </div>
            )}
          </div>
        )
      )}

      {/* --- FINAL_DUEL 화면 (결승전) --- */}
      {room.gameState === GameState.FINAL_DUEL && (
        <div className="flex-grow flex flex-col gap-6" id="final-duel-panel">
          <div className="bg-dark-card border border-gray-800 rounded-2xl p-6 text-center">
            <h2 className="text-3xl font-extrabold tracking-widest font-['Outfit'] bg-gradient-to-r from-brand-red to-brand-yellow bg-clip-text text-transparent mb-1">
              FINAL DUEL
            </h2>
            <p className="text-xs text-gray-400" id="final-round-title">결승 {room.currentRound}라운드: 3판 2선승 심리전</p>
          </div>

          {/* 두 결승 진출자 상태판 */}
          <div className="grid grid-cols-2 gap-4">
            {room.players.filter(p => p.isAlive).map((p, index) => {
              const scoreStars = Array.from({ length: 2 }).map((_, i) => i < p.score);
              return (
                <div key={p.id} className={`bg-dark-card border p-4 rounded-2xl text-center ${p.id === me.playerId ? "border-brand-cyan" : "border-gray-800"}`}>
                  <p className="text-xs text-gray-400 font-semibold mb-1">PLAYER {index + 1}</p>
                  <h3 className="text-lg font-black">{p.nickname}</h3>
                  <div className="flex justify-center gap-1.5 mt-3">
                    {scoreStars.map((earned, i) => (
                      <span key={i} className={`text-2xl ${earned ? "text-brand-yellow animate-bounce" : "text-gray-700"}`}>
                        ★
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-dark-card border border-gray-800 rounded-2xl p-6 flex-grow flex flex-col items-center justify-center gap-6">
            <div className="text-center">
              <p className="text-xs text-gray-400">가위, 바위, 보 중 하나를 비공개로 선택하세요. 2점을 먼저 얻으면 최종 승리합니다.</p>
              <p className="text-sm font-semibold text-brand-teal mt-2">
                선택 완료 인원: {room.submittedCount} / 2명
              </p>
            </div>

            {/* 결승전 가위바위보 선택 카드 */}
            <div className="grid grid-cols-3 gap-4 w-full max-w-md mt-4" id="final-symbol-grid">
              {[
                { symbol: "ROCK" as FinalChoice, name: "바위", color: "from-gray-800 to-black hover:border-gray-500", text: "text-gray-300", svg: ROCK_SVG("w-12 h-12 text-gray-300") },
                { symbol: "SCISSORS" as FinalChoice, name: "가위", color: "from-gray-900 to-gray-800 hover:border-white", text: "text-white", svg: SCISSORS_SVG("w-12 h-12 text-white") },
                { symbol: "PAPER" as FinalChoice, name: "보", color: "from-gray-950 to-pink-950 hover:border-brand-red", text: "text-brand-red", svg: PAPER_SVG("w-12 h-12 text-brand-red") }
              ].map(({ symbol, name, color, text, svg }) => {
                const isSelected = me.finalChoiceSelection === symbol;
                return (
                  <button
                    key={symbol}
                    disabled={!isAlive}
                    onClick={() => submitFinalChoice(symbol)}
                    className={`h-32 rounded-xl flex flex-col items-center justify-center border font-bold transition-all duration-300 p-2 bg-gradient-to-b ${color} ${
                      !isAlive 
                        ? "opacity-35 cursor-not-allowed border-gray-800" 
                        : isSelected
                          ? "border-brand-cyan shadow-[0_0_15px_rgba(102,252,241,0.4)]"
                          : "border-gray-700"
                    }`}
                  >
                    <div className="mb-2">{svg}</div>
                    <span className={`text-xs ${text}`}>{name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* --- GAME_OVER 화면 (게임 종료) --- */}
      {room.gameState === GameState.GAME_OVER && (
        <div className="flex-grow flex flex-col gap-6" id="game-over-panel">
          <div className="bg-dark-card border border-gray-800 rounded-2xl p-8 text-center relative overflow-hidden">
            {/* 장식용 이펙트 */}
            <div className="absolute inset-0 bg-brand-cyan/5 animate-pulse" />
            
            <h2 className="text-xs uppercase tracking-widest text-brand-yellow font-bold mb-2">최종 서바이벌 우승자</h2>
            <div className="text-5xl font-black tracking-wider text-brand-cyan mb-4 drop-shadow-[0_0_15px_rgba(102,252,241,0.5)]">
              👑 {room.players.find(p => p.id === room.winnerId)?.nickname || "없음"}
            </div>
            <p className="text-xs text-gray-400 relative z-10">끝까지 다른 플레이어들을 떨어뜨리고 살아남았습니다!</p>
          </div>

          {/* 전체 라운드 선택 스냅샷 기록 */}
          <div className="bg-dark-card border border-gray-800 rounded-2xl p-6">
            <h3 className="text-sm font-bold border-b border-gray-800 pb-2 mb-4 text-brand-cyan">전체 라운드 결과 정보</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 font-semibold">
                    <th className="py-2.5">라운드</th>
                    <th>칸 수</th>
                    <th>상태</th>
                    <th>결과 요약</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {room.roundResults.map((res, i) => (
                    <tr key={i} className="hover:bg-white/5">
                      <td className="py-3 font-bold">{res.roundNumber} ROUND</td>
                      <td>{res.slotCount}칸</td>
                      <td>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${res.isWipeout ? "bg-red-950 text-red-400 border border-red-500/20" : "bg-green-950 text-green-400 border border-green-500/20"}`}>
                          {res.isWipeout ? "전원 탈락" : "진행 완료"}
                        </span>
                      </td>
                      <td>
                        <div className="space-y-0.5 max-w-sm">
                          {res.selections.map((sel, idx) => (
                            <span key={idx} className="inline-block mr-2 text-[10px] text-gray-400">
                              {sel.nickname}: <span className={sel.isAliveAfterRound ? "text-brand-cyan" : "text-brand-red"}>{sel.slotSelected || "미제출"}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  
                  {/* 결승전이 있었던 경우 결승전 기록 추가 */}
                  {room.finalDuelResults.map((res, i) => (
                    <tr key={i} className="hover:bg-white/5 bg-gradient-to-r from-brand-red/5 to-transparent">
                      <td className="py-3 font-bold text-brand-yellow">결승 R {res.roundNumber}</td>
                      <td>가위바위보</td>
                      <td>
                        <span className="bg-brand-yellow/10 text-brand-yellow border border-brand-yellow/20 px-1.5 py-0.5 rounded text-[10px] font-bold">
                          결승전
                        </span>
                      </td>
                      <td>
                        <span className="text-[10px] text-gray-300">
                          선택: P1 ({formatChoice(res.p1Selection)}) vs P2 ({formatChoice(res.p2Selection)}) ➔ {
                            res.winnerId 
                              ? `승자: ${room.players.find(p => p.id === res.winnerId)?.nickname}`
                              : "무승부"
                          }
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-end gap-3 mt-4">
            {isHost ? (
              <button
                id="play-again-btn"
                onClick={playAgain}
                className="w-full md:w-auto bg-brand-cyan text-black font-bold py-3 px-8 rounded-lg hover:shadow-[0_0_15px_#66FCF1] transition-all"
              >
                다시 플레이 (로비로 이동)
              </button>
            ) : (
              <p className="text-center md:text-right text-xs text-gray-500 mt-2 font-medium">
                방장이 다시 시작할 때까지 대기하고 있습니다...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
