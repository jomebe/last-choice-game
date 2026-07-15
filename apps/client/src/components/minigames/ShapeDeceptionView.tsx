import { useState, useRef, useEffect, useCallback } from "react";
import { ShapeDeceptionPublicState, ShapeDeceptionPrivateState, DrawingStroke, Player } from "../../../../../packages/shared/src/types.ts";
import { MinigameResultView } from "./MinigameResultView.tsx";

interface Props {
  publicState: ShapeDeceptionPublicState;
  privateState: ShapeDeceptionPrivateState | null;
  players: Player[];
  myPlayerId: string;
  timeLeft: number | null;
  isAlive: boolean;
  instanceId: string;
  gameState: string;
  minigameResults: any[];
  onSelectOption: (optionId: string) => void;
  onSendChat: (msg: string) => void;
  onSendStrokes: (strokes: DrawingStroke[]) => void;
  onClearDrawing: () => void;
}

// ─────────────────────────────────────────────
// 드로잉 캔버스
// ─────────────────────────────────────────────
function DrawingCanvas({
  strokes,
  isQuestioner,
  onSendStrokes,
  onClear,
}: {
  strokes: DrawingStroke[];
  isQuestioner: boolean;
  onSendStrokes: (strokes: DrawingStroke[]) => void;
  onClear: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef<Array<{ x: number; y: number }>>([]);
  const pendingStrokes = useRef<DrawingStroke[]>([]);
  const sendTimer = useRef<number | null>(null);
  const [color, setColor] = useState('#E2E8F0');
  const [width, setWidth] = useState(3);
  const [isErase, setIsErase] = useState(false);

  // 전체 스트로크 다시 그리기
  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.isErase ? '#0F172A' : stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = stroke.isErase ? 'destination-out' : 'source-over';

      const pts = stroke.points.map(p => ({
        x: p.x * canvas.width,
        y: p.y * canvas.height
      }));
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }, [strokes]);

  useEffect(() => { redrawAll(); }, [redrawAll]);

  const getPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const rawX = (clientX - rect.left) / rect.width;
    const rawY = (clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(1, rawX)),
      y: Math.max(0, Math.min(1, rawY))
    };
  };

  const flushStrokes = useCallback(() => {
    if (pendingStrokes.current.length > 0) {
      onSendStrokes([...pendingStrokes.current]);
      pendingStrokes.current = [];
    }
  }, [onSendStrokes]);

  const handleDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isQuestioner) return;
    e.preventDefault();
    isDrawing.current = true;
    const pos = getPos(e);
    if (pos) currentStroke.current = [pos];
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isQuestioner || !isDrawing.current) return;
    e.preventDefault();
    const pos = getPos(e);
    if (!pos) return;
    currentStroke.current.push(pos);

    // 미리보기 그리기
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && currentStroke.current.length >= 2) {
      const pts = currentStroke.current;
      const last = pts[pts.length - 2];
      const curr = pts[pts.length - 1];
      ctx.beginPath();
      ctx.strokeStyle = isErase ? '#0F172A' : color;
      ctx.lineWidth = isErase ? width * 3 : width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = isErase ? 'destination-out' : 'source-over';
      ctx.moveTo(last.x * canvas!.width, last.y * canvas!.height);
      ctx.lineTo(curr.x * canvas!.width, curr.y * canvas!.height);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  const handleUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isQuestioner || !isDrawing.current) return;
    isDrawing.current = false;
    if (currentStroke.current.length > 1) {
      const stroke: DrawingStroke = {
        points: currentStroke.current.slice(0, 200),
        color,
        width: isErase ? width * 3 : width,
        isErase
      };
      pendingStrokes.current.push(stroke);
      currentStroke.current = [];

      // 디바운스 전송 (100ms)
      if (sendTimer.current) clearTimeout(sendTimer.current);
      sendTimer.current = window.setTimeout(flushStrokes, 100);
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full h-full">
      {isQuestioner && (
        <div className="flex gap-2 flex-wrap justify-center mb-1">
          {['#E2E8F0', '#F87171', '#34D399', '#60A5FA', '#FBBF24'].map(c => (
            <button
              key={c}
              onClick={() => { setColor(c); setIsErase(false); }}
              className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c && !isErase ? 'scale-125 border-white' : 'border-gray-600'}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <button
            onClick={() => setIsErase(true)}
            className={`px-2 py-1 rounded text-xs font-semibold border ${isErase ? 'border-white text-white' : 'border-gray-600 text-gray-400'}`}
          >
            지우개
          </button>
          <select
            value={width}
            onChange={e => setWidth(Number(e.target.value))}
            className="bg-dark-card border border-gray-700 text-gray-300 text-xs rounded px-1"
          >
            <option value={2}>얇게</option>
            <option value={4}>보통</option>
            <option value={8}>두껍게</option>
          </select>
          <button
            onClick={onClear}
            className="px-2 py-1 rounded text-xs font-semibold border border-gray-600 text-gray-400 hover:border-red-500 hover:text-red-400 transition-colors"
          >
            전체 지우기
          </button>
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={400}
        height={300}
        className="w-full h-full rounded-2xl border border-slate-700 bg-slate-900"
        style={{ cursor: isQuestioner ? (isErase ? 'cell' : 'crosshair') : 'default', touchAction: 'none' }}
        onMouseDown={handleDown}
        onMouseMove={handleMove}
        onMouseUp={handleUp}
        onMouseLeave={handleUp}
        onTouchStart={handleDown}
        onTouchMove={handleMove}
        onTouchEnd={handleUp}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// 채팅
// ─────────────────────────────────────────────
function ChatBox({ messages, isAlive, onSend }: {
  messages: Array<{ playerId: string; nickname: string; text: string; timestamp: number }>;
  isAlive: boolean;
  onSend: (msg: string) => void;
}) {
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || !isAlive) return;
    onSend(trimmed);
    setInput('');
  };

  return (
    <div className="flex flex-col bg-dark-card border border-gray-700 rounded-xl overflow-hidden h-44">
      <div className="px-3 py-2 border-b border-gray-700 text-xs text-gray-400 font-semibold">💬 채팅</div>
      <div className="flex-grow overflow-y-auto px-3 py-2 space-y-1 text-xs">
        {messages.length === 0 && (
          <p className="text-gray-500 italic">출제자의 힌트를 기다리세요...</p>
        )}
        {messages.map((m, i) => (
          <div key={i}>
            <span className="font-semibold text-gray-300">{m.nickname}: </span>
            <span className="text-gray-100">{m.text}</span>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      {isAlive && (
        <div className="flex border-t border-gray-700">
          <input
            className="flex-grow bg-transparent px-3 py-2 text-xs text-gray-200 outline-none placeholder-gray-600"
            placeholder="메시지 입력..."
            value={input}
            maxLength={100}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
            id="shape-chat-input"
          />
          <button
            onClick={handleSend}
            className="px-3 text-xs text-violet-400 hover:text-violet-200 font-semibold"
          >전송</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 메인 모양 추리 컴포넌트
// ─────────────────────────────────────────────
export function ShapeDeceptionView({
  publicState, privateState, players, myPlayerId, timeLeft,
  isAlive, instanceId, gameState, minigameResults,
  onSelectOption, onSendChat, onSendStrokes, onClearDrawing
}: Props) {
  const { questioner, questionerNickname, options, submittedCount, drawingStrokes, chatMessages } = publicState;
  const isQuestioner = privateState?.isQuestioner ?? false;
  const mySelection = privateState?.mySelection ?? null;
  const alivePlayers = players.filter(p => p.isAlive);
  const guessersCount = alivePlayers.filter(p => p.id !== questioner).length;

  const isRevealed = gameState === 'REVEALING' || gameState === 'MINIGAME_RESULT';
  const correctOptionId = publicState.correctOptionId ?? privateState?.correctOptionId ?? null;

  const [boardFlipped, setBoardFlipped] = useState(false);
  const [optionsFlipped, setOptionsFlipped] = useState(false);

  useEffect(() => {
    if (isRevealed) {
      // 보드 뒤집기 딜레이
      const timer1 = setTimeout(() => setBoardFlipped(true), 300);
      // 보기 카드 뒤집기 딜레이
      const timer2 = setTimeout(() => setOptionsFlipped(true), 700);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    } else {
      setBoardFlipped(false);
      setOptionsFlipped(false);
    }
  }, [gameState]);

  // 추리자 선택 분석
  const selections = publicState.selections ?? null;
  const optionCounts: Record<string, number> = { A: 0, B: 0, C: 0 };
  const optionPlayers: Record<string, string[]> = { A: [], B: [], C: [] };
  if (selections) {
    for (const [pId, optId] of Object.entries(selections)) {
      if (optId) {
        optionCounts[optId] = (optionCounts[optId] ?? 0) + 1;
        const player = players.find(p => p.id === pId);
        if (player) {
          optionPlayers[optId].push(player.nickname);
        }
      }
    }
  }

  const correctSvg = options.find(o => o.id === correctOptionId)?.svgData ?? '';

  return (
    <div className="flex-grow flex flex-col gap-4" id="shape-deception-panel">
      {/* 헤더 */}
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold" style={{ color: '#A78BFA' }}>진짜 모양을 찾아라</h2>
        <p className="text-sm text-gray-400">
          출제자: <span className="text-violet-300 font-semibold">{questionerNickname}</span>
          {isQuestioner && <span className="ml-2 text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full">나</span>}
        </p>
        <div className="flex justify-center gap-4 text-sm mt-1">
          {!isRevealed && !isQuestioner && (
            <span className="text-gray-400">선택 완료: <span className="text-white font-bold">{submittedCount} / {guessersCount}명</span></span>
          )}
          {timeLeft !== null && !isRevealed && (
            <span className={`font-bold ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-violet-400'}`}>
              ⏱ {timeLeft}초
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-4 flex-col md:flex-row">
        {/* 왼쪽: 출제자 영역 / 드로잉 캔버스 */}
        <div className="flex-1 space-y-3">
          {/* 드로잉 보드 3D 플립 컨테이너 */}
          <div className="w-full max-w-sm mx-auto aspect-[4/3] flip-container">
            <div className={`flip-card-inner w-full h-full ${boardFlipped ? 'is-flipped' : ''}`}>
              {/* 앞면: 캔버스 / 드로잉 영역 */}
              <div className="flip-card-front w-full h-full flex flex-col">
                <DrawingCanvas
                  strokes={drawingStrokes}
                  isQuestioner={isQuestioner && !isRevealed}
                  onSendStrokes={onSendStrokes}
                  onClear={onClearDrawing}
                />
              </div>

              {/* 뒷면: 진짜 정답 모양 공개 */}
              <div className="flip-card-back w-full h-full flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-violet-500/80 bg-slate-950 text-center shadow-[0_0_30px_rgba(139,92,246,0.3)]">
                <span className="text-[11px] uppercase tracking-wider font-extrabold text-violet-400 mb-2">🎯 출제자가 본 진짜 모양</span>
                <div
                  className="w-36 h-36 rounded-2xl overflow-hidden bg-slate-900 border border-violet-500/30 p-4 shadow-inner"
                  dangerouslySetInnerHTML={{ __html: correctSvg }}
                />
                <span className="text-2xl font-black text-violet-300 mt-3">정답 모양: {correctOptionId}번</span>
                <p className="text-xs text-gray-500 mt-1">출제자가 선택하고 힌트를 주려 했던 원래 형태입니다.</p>
              </div>
            </div>
          </div>

          {/* 채팅 영역 */}
          <ChatBox
            messages={chatMessages}
            isAlive={isAlive}
            onSend={msg => onSendChat(msg)}
          />
        </div>

        {/* 오른쪽: 보기 선택 영역 */}
        <div className="flex-1 space-y-3">
          {isQuestioner && !isRevealed ? (
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 text-center text-gray-400">
              <p className="text-lg">출제자는 보기를 선택할 수 없습니다.</p>
              <p className="text-sm mt-2">채팅이나 그림으로 힌트를 주세요!</p>
              <div className="bg-violet-900/30 border border-violet-500/30 rounded-xl p-4 mt-6">
                <p className="text-xs text-violet-300 font-semibold mb-2 uppercase tracking-wide">🎯 정답 모양 (출제자만 보임)</p>
                <div
                  className="w-24 h-24 mx-auto rounded-lg border-2 border-violet-400 overflow-hidden bg-slate-900 p-2"
                  dangerouslySetInnerHTML={{ __html: options.find(o => o.id === correctOptionId)?.svgData ?? '' }}
                />
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-300 text-center">
                {isRevealed ? '추리자들의 선택 및 정답 결과' : !isAlive ? '👁 관전 중' : mySelection ? `✓ ${mySelection}번 선택 완료` : '보기 중 정답을 선택하세요'}
              </p>

              {/* 보기 카드 3D 뒤집기 그리드 */}
              <div className="grid grid-cols-3 gap-3" id="shape-options-grid">
                {options.map((opt, idx) => {
                  const isSelected = mySelection === opt.id;
                  const isCorrect = opt.id === correctOptionId;
                  const count = optionCounts[opt.id] ?? 0;
                  const nicknames = optionPlayers[opt.id] || [];

                  let backColorClass = "bg-slate-800/50 border-slate-700 text-slate-400";
                  let borderClass = "border-gray-700";
                  let labelColorClass = "text-slate-400";

                  if (isCorrect) {
                    backColorClass = "bg-green-500/10 border-green-500/80 text-green-300 shadow-[0_0_20px_rgba(34,197,94,0.2)]";
                    borderClass = "border-green-500";
                    labelColorClass = "text-green-400 font-black";
                  } else {
                    backColorClass = "bg-red-500/10 border-red-500/80 text-red-300 shadow-[0_0_20px_rgba(239,68,68,0.2)]";
                    borderClass = "border-red-500";
                    labelColorClass = "text-red-400";
                  }

                  return (
                    <div
                      key={opt.id}
                      id={`shape-option-${opt.id}`}
                      className="aspect-[3/4] flip-container w-full"
                    >
                      <div
                        className={`flip-card-inner w-full h-full ${optionsFlipped ? 'is-flipped' : ''}`}
                        style={{ transitionDelay: `${idx * 150}ms` }}
                      >
                        {/* 앞면: 보기 이미지 버튼 */}
                        <button
                          disabled={!isAlive || isRevealed}
                          onClick={() => onSelectOption(opt.id)}
                          className={[
                            "flip-card-front w-full h-full flex flex-col items-center justify-between p-3 border-2 rounded-xl transition-all duration-200",
                            isAlive && !isRevealed ? "hover:scale-105 active:scale-95 cursor-pointer" : "cursor-default opacity-60",
                            isSelected ? "bg-violet-500/20 border-violet-400 ring-2 ring-violet-400/40 scale-105" : "bg-dark-card border-gray-700 hover:border-gray-500"
                          ].join(" ")}
                        >
                          <div
                            className="w-full aspect-square rounded-lg overflow-hidden bg-slate-900 p-2 flex items-center justify-center"
                            dangerouslySetInnerHTML={{ __html: opt.svgData }}
                          />
                          <span className={`text-sm font-black ${isSelected ? 'text-violet-300' : 'text-gray-400'}`}>
                            {opt.id}
                          </span>
                        </button>

                        {/* 뒷면: 결과 피드백 */}
                        <div
                          className={`flip-card-back w-full h-full flex flex-col items-center justify-between p-2 rounded-xl border-2 text-center select-none ${backColorClass}`}
                        >
                          <span className="text-[10px] uppercase font-bold text-gray-500">{opt.id}번</span>
                          <div className="flex flex-col items-center justify-center flex-grow">
                            <span className={`text-xl font-black ${labelColorClass}`}>{count}명 선택</span>
                            {nicknames.length > 0 && (
                              <p className="text-[9px] mt-1 font-medium max-w-[80px] truncate leading-none text-white/70">
                                {nicknames.join(", ")}
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] font-extrabold uppercase">
                            {isCorrect ? '🎯 정답' : '❌ 오답'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 결과 패널 */}
      {isRevealed && minigameResults.length > 0 && (
        <div className="w-full max-w-md mx-auto mt-2 animate-fade-in">
          <MinigameResultView
            result={minigameResults[minigameResults.length - 1]}
            players={players}
          />
        </div>
      )}
    </div>
  );
}
