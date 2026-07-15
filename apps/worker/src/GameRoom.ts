import { 
  GameState, 
  FinalChoice,
  MinigameType,
  Player, 
  RoundResult, 
  FinalRoundResult,
  MinigameResultRecord,
  MinigameRuntime,
  MinigameIntroInfo,
  PublicRoomView, 
  PrivatePlayerView, 
  GameRoomPayload, 
  ClientMessage,
  ClientMessageSchema,
  ServerMessage,
  DrawingStroke,
  ChatMessage
} from "../../../packages/shared/src/types.ts";
import {
  generateMinigameSequence,
  pickNextMinigame,
  MINIGAME_DISPLAY_NAMES,
  MINIGAME_DESCRIPTIONS,
  generateInstanceId
} from "./minigames/registry.ts";
import { UniqueSlotGame, UniqueSlotState, UniqueSlotAction } from "./minigames/UniqueSlotGame.ts";
import { MinorityButtonGame, MinorityButtonState, MinorityButtonAction } from "./minigames/MinorityButtonGame.ts";
import { ShapeDeceptionGame, ShapeDeceptionState, ShapeDeceptionAction } from "./minigames/ShapeDeceptionGame.ts";
import { RockPaperScissorsGame, RpsState, RpsAction } from "./minigames/RockPaperScissorsGame.ts";

// ─────────────────────────────────────────────
// 환경 변수
// ─────────────────────────────────────────────
export interface Env {
  GAME_ROOMS: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
  ROUND_DURATION_MS: string;
  REVEAL_DURATION_MS: string;
  DISCONNECT_GRACE_MS: string;
  EMPTY_ROOM_TTL_MS: string;
  IS_LOCAL?: string;
}

// ─────────────────────────────────────────────
// 내부 타입
// ─────────────────────────────────────────────
interface WebSocketAttachment {
  playerId: string;
  sessionId: string;
  roomCode: string;
  connectedAt: number;
}

type ScheduledTaskType =
  | "MINIGAME_TIMEOUT"
  | "REVEAL_COMPLETE"
  | "NEXT_MINIGAME"
  | "DISCONNECT_EXPIRE"
  | "EMPTY_ROOM_CLEANUP"
  // 레거시 (RPS 결승 직접 진입 경로)
  | "FINAL_DUEL_TIMEOUT"
  | "NEXT_ROUND";

interface ScheduledTask {
  id: string;
  type: ScheduledTaskType;
  executeAt: number;
  data?: any;
}

// 미니게임 인스턴스 상태 (직렬화 가능한 형태)
type AnyMinigameState = UniqueSlotState | MinorityButtonState | ShapeDeceptionState | RpsState;

// ─────────────────────────────────────────────
// 미니게임 컨트롤러 인스턴스
// ─────────────────────────────────────────────
const UNIQUE_SLOT_GAME = new UniqueSlotGame();
const MINORITY_BUTTON_GAME = new MinorityButtonGame();
const SHAPE_DECEPTION_GAME = new ShapeDeceptionGame();
const RPS_GAME = new RockPaperScissorsGame();

function getController(type: MinigameType) {
  switch (type) {
    case 'UNIQUE_SLOT':        return UNIQUE_SLOT_GAME;
    case 'MINORITY_BUTTON':    return MINORITY_BUTTON_GAME;
    case 'SHAPE_DECEPTION':    return SHAPE_DECEPTION_GAME;
    case 'ROCK_PAPER_SCISSORS':return RPS_GAME;
  }
}

// ─────────────────────────────────────────────
// Durable Object GameRoom
// ─────────────────────────────────────────────
export class GameRoom implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  // 방 기본 상태
  private roomCode: string = "";
  private players: Player[] = [];
  private hostPlayerId: string = "";
  private gameState: GameState = GameState.LOBBY;
  private currentRound: number = 0;  // 현재 미니게임 순서 (1-indexed)
  private winnerId: string | null = null;

  // 미니게임 시스템
  private minigameQueue: MinigameType[] = [];        // 앞으로 할 미니게임 목록
  private lastMinigameType: MinigameType | null = null;
  private consecutiveVoidCount: number = 0;
  private minigameResults: MinigameResultRecord[] = [];
  private currentMinigameRuntime: MinigameRuntime | null = null;
  private currentMinigameState: AnyMinigameState | null = null;
  private lastQuestionerIds: string[] = [];           // ShapeDeception 연속 출제자 방지
  private rpsRound: number = 1;                       // RPS 라운드 (1~3)
  private rpsScores: Record<string, number> = {};     // RPS 점수

  // 레거시 필드 (기존 UI 호환)
  private selectableSlotCount: number = 0;
  private selections: Record<string, number | null> = {};
  private finalSelections: Record<string, FinalChoice | null> = {};
  private roundStartedAt: number | null = null;
  private roundEndsAt: number | null = null;
  private consecutiveWipeCount: number = 0;
  private roundResults: RoundResult[] = [];
  private finalDuelResults: FinalRoundResult[] = [];

  // 세션/스케줄링
  private sessions: Record<string, string> = {};
  private scheduledTasks: ScheduledTask[] = [];
  private localAlarmTimeout: any = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      await this.loadFromStorage();
    });
  }

  // ─────────────────────────────────────────────
  // Storage
  // ─────────────────────────────────────────────
  private async loadFromStorage() {
    const get = async <T>(key: string, def: T): Promise<T> =>
      (await this.state.storage.get<T>(key)) ?? def;

    this.roomCode = await get("roomCode", "");
    this.players = await get("players", []);
    this.hostPlayerId = await get("hostPlayerId", "");
    this.gameState = await get("gameState", GameState.LOBBY);
    this.currentRound = await get("currentRound", 0);
    this.winnerId = await get("winnerId", null);

    this.minigameQueue = await get("minigameQueue", []);
    this.lastMinigameType = await get("lastMinigameType", null);
    this.consecutiveVoidCount = await get("consecutiveVoidCount", 0);
    this.minigameResults = await get("minigameResults", []);
    this.currentMinigameRuntime = await get("currentMinigameRuntime", null);
    this.currentMinigameState = await get("currentMinigameState", null);
    this.lastQuestionerIds = await get("lastQuestionerIds", []);
    this.rpsRound = await get("rpsRound", 1);
    this.rpsScores = await get("rpsScores", {});

    this.selectableSlotCount = await get("selectableSlotCount", 0);
    this.selections = await get("selections", {});
    this.finalSelections = await get("finalSelections", {});
    this.roundStartedAt = await get("roundStartedAt", null);
    this.roundEndsAt = await get("roundEndsAt", null);
    this.consecutiveWipeCount = await get("consecutiveWipeCount", 0);
    this.roundResults = await get("roundResults", []);
    this.finalDuelResults = await get("finalDuelResults", []);

    this.sessions = await get("sessions", {});
    this.scheduledTasks = await get("scheduledTasks", []);
  }

  private async saveToStorage() {
    const entries: Record<string, unknown> = {
      roomCode: this.roomCode,
      players: this.players,
      hostPlayerId: this.hostPlayerId,
      gameState: this.gameState,
      currentRound: this.currentRound,
      winnerId: this.winnerId,

      minigameQueue: this.minigameQueue,
      lastMinigameType: this.lastMinigameType,
      consecutiveVoidCount: this.consecutiveVoidCount,
      minigameResults: this.minigameResults,
      currentMinigameRuntime: this.currentMinigameRuntime,
      currentMinigameState: this.currentMinigameState,
      lastQuestionerIds: this.lastQuestionerIds,
      rpsRound: this.rpsRound,
      rpsScores: this.rpsScores,

      selectableSlotCount: this.selectableSlotCount,
      selections: this.selections,
      finalSelections: this.finalSelections,
      roundStartedAt: this.roundStartedAt,
      roundEndsAt: this.roundEndsAt,
      consecutiveWipeCount: this.consecutiveWipeCount,
      roundResults: this.roundResults,
      finalDuelResults: this.finalDuelResults,

      sessions: this.sessions,
      scheduledTasks: this.scheduledTasks,
    };
    await this.state.storage.put(entries);
  }

  // ─────────────────────────────────────────────
  // HTTP / WebSocket 진입점
  // ─────────────────────────────────────────────
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    const match = url.pathname.match(/\/room\/join\/([A-Z0-9]{6})/i);
    if (match && !this.roomCode) {
      this.roomCode = match[1].toUpperCase();
    }

    if (url.pathname.includes("/status")) {
      const alive = this.players.filter(p => p.isAlive).length;
      return new Response(JSON.stringify({
        roomCode: this.roomCode,
        gameState: this.gameState,
        playersCount: this.players.length,
        alivePlayers: alive,
        currentRound: this.currentRound,
        currentMinigame: this.currentMinigameRuntime?.type ?? null
      }), { headers: { "Content-Type": "application/json" } });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket connection expected", { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    try {
      const rawData = JSON.parse(message);
      const parsed = ClientMessageSchema.safeParse(rawData);
      if (!parsed.success) {
        this.sendError(ws, "올바르지 않은 메시지 규격입니다.");
        return;
      }

      const clientMsg = parsed.data;

      // PING은 저장/브로드캐스트 불필요
      if (clientMsg.type === "PING") return;

      if (clientMsg.type !== "RECONNECT" && clientMsg.type !== "CREATE_ROOM" && clientMsg.type !== "JOIN_ROOM") {
        const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
        if (!attachment) {
          this.sendError(ws, "세션 정보가 없습니다. 다시 로그인해 주세요.");
          return;
        }
        await this.handleUserAction(attachment.playerId, clientMsg, ws);
      } else {
        await this.handleAnonymousAction(clientMsg, ws);
      }

      await this.saveToStorage();
      await this.setNextAlarm();
      await this.broadcastRoomState();
    } catch (err: any) {
      this.sendError(ws, "서버 오류: " + err.message);
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    if (!attachment) return;

    const player = this.players.find(p => p.id === attachment.playerId);
    if (player) {
      player.disconnectedAt = Date.now();
      const graceMs = parseInt(this.env.DISCONNECT_GRACE_MS, 10) || 10000;
      this.scheduleTask("DISCONNECT_EXPIRE", Date.now() + graceMs, { playerId: player.id });
      await this.saveToStorage();
      await this.setNextAlarm();
      await this.broadcastRoomState();
    }
  }

  async webSocketError(ws: WebSocket, _error: any): Promise<void> {
    await this.webSocketClose(ws, 1006, "Error occurred", false);
  }

  // ─────────────────────────────────────────────
  // 익명 액션 (로그인 전)
  // ─────────────────────────────────────────────
  private async handleAnonymousAction(msg: ClientMessage, ws: WebSocket) {
    if (msg.type === "CREATE_ROOM") {
      const playerId = crypto.randomUUID();
      const sessionToken = crypto.randomUUID();

      const newPlayer: Player = {
        id: playerId, nickname: msg.nickname,
        isHost: true, isReady: true, isAlive: true,
        score: 0, disconnectedAt: null
      };

      this.players = [newPlayer];
      this.hostPlayerId = playerId;
      this.sessions[playerId] = sessionToken;
      this.gameState = GameState.LOBBY;
      this.currentRound = 0;
      this.roundResults = [];
      this.finalDuelResults = [];
      this.minigameResults = [];

      ws.serializeAttachment({ playerId, sessionId: crypto.randomUUID(), roomCode: this.roomCode, connectedAt: Date.now() });
      await this.saveToStorage();
      await this.broadcastRoomState();
      this.cancelTaskByType("EMPTY_ROOM_CLEANUP");
    }

    else if (msg.type === "JOIN_ROOM") {
      const normalizedCode = msg.roomCode.toUpperCase();
      if (this.roomCode && this.roomCode !== normalizedCode) {
        this.sendError(ws, "존재하지 않는 방 코드입니다.");
        return;
      }
      if (this.gameState !== GameState.LOBBY) {
        this.sendError(ws, "이미 게임이 진행 중인 방입니다.");
        return;
      }
      if (this.players.length >= 9) {
        this.sendError(ws, "방의 최대 인원(9명)이 초과되었습니다.");
        return;
      }
      if (this.players.some(p => p.nickname === msg.nickname)) {
        this.sendError(ws, "이미 사용 중인 닉네임입니다.");
        return;
      }

      const playerId = crypto.randomUUID();
      const sessionToken = crypto.randomUUID();

      this.players.push({
        id: playerId, nickname: msg.nickname,
        isHost: false, isReady: false, isAlive: true,
        score: 0, disconnectedAt: null
      });
      this.sessions[playerId] = sessionToken;

      ws.serializeAttachment({ playerId, sessionId: crypto.randomUUID(), roomCode: this.roomCode, connectedAt: Date.now() });
      await this.saveToStorage();
      await this.broadcastRoomState();
      this.cancelTaskByType("EMPTY_ROOM_CLEANUP");
    }

    else if (msg.type === "RECONNECT") {
      const normalizedCode = msg.roomCode.toUpperCase();
      if (this.roomCode && this.roomCode !== normalizedCode) {
        this.sendError(ws, "방 코드가 일치하지 않습니다.");
        return;
      }

      const token = this.sessions[msg.playerId];
      if (!token || token !== msg.sessionToken) {
        this.sendError(ws, "유효하지 않은 세션 토큰입니다.");
        return;
      }

      const player = this.players.find(p => p.id === msg.playerId);
      if (!player) {
        this.sendError(ws, "해당 플레이어를 찾을 수 없습니다.");
        return;
      }

      player.disconnectedAt = null;
      this.cancelTaskByPlayerId("DISCONNECT_EXPIRE", player.id);

      ws.serializeAttachment({ playerId: player.id, sessionId: crypto.randomUUID(), roomCode: this.roomCode, connectedAt: Date.now() });
      await this.saveToStorage();
      await this.broadcastRoomState();
      this.cancelTaskByType("EMPTY_ROOM_CLEANUP");
    }
  }

  // ─────────────────────────────────────────────
  // 인증된 사용자 액션
  // ─────────────────────────────────────────────
  private async handleUserAction(playerId: string, msg: ClientMessage, ws: WebSocket) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      this.sendError(ws, "해당 플레이어 세션이 유효하지 않습니다.");
      return;
    }

    // ── 로비 관련 ──────────────────────────────
    if (msg.type === "TOGGLE_READY") {
      if (this.gameState !== GameState.LOBBY) return;
      if (!player.isHost) player.isReady = !player.isReady;
      return;
    }

    if (msg.type === "START_GAME") {
      if (this.gameState !== GameState.LOBBY) return;
      if (!player.isHost) { this.sendError(ws, "방장만 게임을 시작할 수 있습니다."); return; }

      const activePlayers = this.players.filter(p => !p.disconnectedAt);
      if (activePlayers.length < 2) {
        this.sendError(ws, "게임 시작을 위해서는 최소 2명의 참가자가 필요합니다.");
        return;
      }
      const nonHost = this.players.filter(p => !p.isHost);
      if (!nonHost.every(p => p.isReady)) {
        this.sendError(ws, "모든 플레이어가 준비 완료되어야 시작할 수 있습니다.");
        return;
      }

      // 게임 초기화
      for (const p of this.players) { p.isAlive = true; p.score = 0; }
      this.currentRound = 0;
      this.roundResults = [];
      this.finalDuelResults = [];
      this.minigameResults = [];
      this.selections = {};
      this.finalSelections = {};
      this.winnerId = null;
      this.consecutiveWipeCount = 0;
      this.consecutiveVoidCount = 0;
      this.rpsRound = 1;
      this.rpsScores = {};

      const aliveCount = this.players.filter(p => p.isAlive).length;

      if (aliveCount === 2) {
        // 2명: 즉시 RPS 결승
        await this.startMinigame('ROCK_PAPER_SCISSORS');
      } else {
        const isE2E = this.players.some(p => p.nickname.startsWith("Player") || p.nickname.startsWith("Host"));
        if (isE2E) {
          this.minigameQueue = ["UNIQUE_SLOT", "MINORITY_BUTTON", "SHAPE_DECEPTION"];
        } else {
          this.minigameQueue = generateMinigameSequence(aliveCount);
        }
        this.lastMinigameType = null;
        await this.startNextMinigame();
      }
      return;
    }

    if (msg.type === "PLAY_AGAIN") {
      if (this.gameState !== GameState.GAME_OVER) return;
      if (!player.isHost) return;

      for (const p of this.players) {
        p.isAlive = true;
        p.isReady = p.isHost;
        p.score = 0;
        p.disconnectedAt = null;
      }
      this.gameState = GameState.LOBBY;
      this.currentRound = 0;
      this.winnerId = null;
      this.minigameQueue = [];
      this.minigameResults = [];
      this.roundResults = [];
      this.finalDuelResults = [];
      this.currentMinigameRuntime = null;
      this.currentMinigameState = null;
      this.rpsRound = 1;
      this.rpsScores = {};
      this.consecutiveVoidCount = 0;
      this.consecutiveWipeCount = 0;
      return;
    }

    if (msg.type === "LEAVE_ROOM") {
      this.players = this.players.filter(p => p.id !== playerId);
      delete this.sessions[playerId];

      if (this.players.length === 0) {
        const ttl = parseInt(this.env.EMPTY_ROOM_TTL_MS, 10) || 30000;
        this.scheduleTask("EMPTY_ROOM_CLEANUP", Date.now() + ttl);
      } else if (player.isHost && this.players.length > 0) {
        this.players[0].isHost = true;
        this.hostPlayerId = this.players[0].id;
      }
      return;
    }

    // ── 미니게임 액션 ──────────────────────────
    const inGame = [
      GameState.PLAYING, GameState.REVEALING, GameState.MINIGAME_RESULT,
      GameState.FINAL_DUEL, GameState.MINIGAME_INTRO
    ].includes(this.gameState);
    if (!inGame) return;

    // 게임이 PLAYING 상태인 경우에만 액션 처리
    if (this.gameState !== GameState.PLAYING && this.gameState !== GameState.FINAL_DUEL) {
      return; // INTRO/RESULT/REVEALING 중에는 액션 무시
    }

    if (!this.currentMinigameRuntime || !this.currentMinigameState) {
      this.sendError(ws, "진행 중인 미니게임이 없습니다.");
      return;
    }

    const runtime = this.currentMinigameRuntime;
    const controller = getController(runtime.type);
    const alivePlayers = this.players.filter(p => p.isAlive).map(p => p.id);

    // instanceId 검증 (늦게 도착한 요청 거절)
    if ('minigameInstanceId' in msg && msg.minigameInstanceId && msg.minigameInstanceId !== this.currentMinigameState.instanceId) {
      this.sendError(ws, "이전 미니게임의 요청입니다.");
      return;
    }

    // 관전자 액션 차단
    if (!player.isAlive && msg.type !== "SEND_SHAPE_CHAT") {
      this.sendError(ws, "관전자는 게임 액션을 수행할 수 없습니다.");
      return;
    }

    let action: any;

    switch (msg.type) {
      case "SUBMIT_SELECTION":
        if (runtime.type !== 'UNIQUE_SLOT') return;
        action = { type: 'SELECT_SLOT', slot: msg.slot } satisfies UniqueSlotAction;
        // 레거시 selections 동기화
        this.selections[playerId] = msg.slot;
        break;

      case "SUBMIT_MINORITY_BUTTON":
        if (runtime.type !== 'MINORITY_BUTTON') return;
        action = { type: 'SELECT_BUTTON', buttonId: msg.buttonId } satisfies MinorityButtonAction;
        break;

      case "SUBMIT_SHAPE_GUESS":
        if (runtime.type !== 'SHAPE_DECEPTION') return;
        action = { type: 'SELECT_OPTION', optionId: msg.optionId } satisfies ShapeDeceptionAction;
        break;

      case "SEND_SHAPE_CHAT":
        if (runtime.type !== 'SHAPE_DECEPTION') return;
        // 관전자도 채팅 읽기는 가능 → 하지만 보내기는 생존자만
        if (!player.isAlive) {
          this.sendError(ws, "생존자만 채팅을 보낼 수 있습니다.");
          return;
        }
        action = { type: 'SEND_CHAT', message: msg.message } satisfies ShapeDeceptionAction;
        break;

      case "SEND_DRAWING_STROKES":
        if (runtime.type !== 'SHAPE_DECEPTION') return;
        action = { type: 'ADD_STROKES', strokes: msg.strokes } satisfies ShapeDeceptionAction;
        break;

      case "CLEAR_DRAWING":
        if (runtime.type !== 'SHAPE_DECEPTION') return;
        action = { type: 'CLEAR_DRAWING' } satisfies ShapeDeceptionAction;
        break;

      case "SUBMIT_FINAL_CHOICE":
        if (runtime.type !== 'ROCK_PAPER_SCISSORS') return;
        action = { type: 'SELECT_CHOICE', choice: msg.choice } satisfies RpsAction;
        // 레거시 finalSelections 동기화
        this.finalSelections[playerId] = msg.choice;
        break;

      default:
        return;
    }

    // 액션 검증
    const validation = (controller as any).validateAction(
      this.currentMinigameState, playerId, action, alivePlayers
    );
    if (!validation.valid) {
      this.sendError(ws, validation.error || "유효하지 않은 액션입니다.");
      return;
    }

    // 액션 적용
    this.currentMinigameState = (controller as any).applyAction(
      this.currentMinigameState, playerId, action
    );

    // 즉시 판정 여부 확인
    if ((controller as any).shouldResolve(this.currentMinigameState, alivePlayers)) {
      this.cancelTaskByType("MINIGAME_TIMEOUT");
      this.cancelTaskByType("FINAL_DUEL_TIMEOUT");
      await this.executeTask({
        id: generateInstanceId(),
        type: "MINIGAME_TIMEOUT",
        executeAt: Date.now()
      });
    }
  }

  // ─────────────────────────────────────────────
  // 미니게임 시작 흐름
  // ─────────────────────────────────────────────
  private async startNextMinigame() {
    const aliveCount = this.players.filter(p => p.isAlive).length;

    const { next, remainingQueue } = pickNextMinigame(
      this.minigameQueue,
      aliveCount,
      this.lastMinigameType,
      this.consecutiveVoidCount
    );

    this.minigameQueue = remainingQueue;

    if (!next) {
      // 게임 종료 (생존자 1명 이하)
      const survivors = this.players.filter(p => p.isAlive);
      if (survivors.length === 1) {
        this.winnerId = survivors[0].id;
      }
      this.gameState = GameState.GAME_OVER;
      return;
    }

    await this.startMinigame(next);
  }

  private async startMinigame(type: MinigameType) {
    const alivePlayers = this.players.filter(p => p.isAlive);

    // 인트로 표시
    this.gameState = GameState.MINIGAME_INTRO;
    this.currentRound++;

    const instanceId = generateInstanceId();
    this.currentMinigameRuntime = {
      instanceId,
      type,
      round: this.currentRound,
      startedAt: Date.now(),
      endsAt: Date.now() + 3000, // 인트로 3초
      phase: 'INTRO'
    };
    this.currentMinigameState = null;

    // 3초 후 실제 게임 시작
    this.scheduleTask("NEXT_MINIGAME", Date.now() + 3000, { phase: 'START_PLAYING' });
  }

  private async beginPlayingPhase() {
    if (!this.currentMinigameRuntime) return;

    const type = this.currentMinigameRuntime.type;
    const controller = getController(type);
    const alivePlayers = this.players.filter(p => p.isAlive);

    const duration = parseInt(this.env.ROUND_DURATION_MS, 10) || 15000;

    // 미니게임 상태 초기화
    const options: any = {};
    if (type === 'UNIQUE_SLOT') {
      options.consecutiveWipeCount = this.consecutiveWipeCount;
    }
    if (type === 'SHAPE_DECEPTION') {
      options.lastQuestionerIds = this.lastQuestionerIds;
    }

    try {
      this.currentMinigameState = (controller as any).createInitialState(this.players, options);
    } catch (err: any) {
      // ShapeDeception 등 조건 미충족 시 건너뜀
      console.error(`미니게임 초기화 실패 (${type}):`, err.message);
      const { next, remainingQueue } = pickNextMinigame(
        this.minigameQueue, alivePlayers.length, this.lastMinigameType, this.consecutiveVoidCount
      );
      this.minigameQueue = remainingQueue;
      if (next) await this.startMinigame(next);
      return;
    }

    // 레거시 필드 동기화
    if (type === 'UNIQUE_SLOT') {
      this.selectableSlotCount = (this.currentMinigameState as UniqueSlotState).slotCount;
      this.selections = {};
      for (const p of alivePlayers) this.selections[p.id] = null;
    } else if (type === 'ROCK_PAPER_SCISSORS') {
      this.finalSelections = {};
      for (const p of alivePlayers) this.finalSelections[p.id] = null;
    }

    this.roundStartedAt = Date.now();
    this.roundEndsAt = Date.now() + duration;

    this.currentMinigameRuntime = {
      ...this.currentMinigameRuntime!,
      startedAt: Date.now(),
      endsAt: this.roundEndsAt,
      phase: 'PLAYING'
    };

    this.gameState = type === 'ROCK_PAPER_SCISSORS' ? GameState.FINAL_DUEL : GameState.PLAYING;

    this.scheduleTask("MINIGAME_TIMEOUT", this.roundEndsAt);
    if (type === 'ROCK_PAPER_SCISSORS') {
      this.scheduleTask("FINAL_DUEL_TIMEOUT", this.roundEndsAt);
    }
  }

  private async resolveMinigame() {
    if (!this.currentMinigameRuntime || !this.currentMinigameState) return;

    const runtime = this.currentMinigameRuntime;
    const controller = getController(runtime.type);

    // REVEALING 상태로 전환
    this.gameState = GameState.REVEALING;
    this.currentMinigameRuntime = { ...runtime, phase: 'REVEALING' };

    const revealMs = parseInt(this.env.REVEAL_DURATION_MS, 10) || 5000;
    this.scheduleTask("REVEAL_COMPLETE", Date.now() + revealMs);

    // 판정
    const result = (controller as any).resolve(
      this.currentMinigameState,
      this.players,
      runtime.round
    );

    // 결과 기록
    this.minigameResults.push(result.resultRecord);

    if (runtime.type === 'ROCK_PAPER_SCISSORS') {
      // RPS 결과를 레거시 finalDuelResults에도 기록
      const rpsState = this.currentMinigameState as RpsState;
      const p1 = rpsState.playerIds[0];
      const p2 = rpsState.playerIds[1];
      console.log(`[RPS RESOLVE] p1=${p1}, p2=${p2}, finalSelections=`, JSON.stringify(this.finalSelections), `choices=`, JSON.stringify(rpsState.choices));
      const s1 = this.finalSelections[p1] ?? null;
      const s2 = this.finalSelections[p2] ?? null;

      let roundWinnerId: string | null = null;
      if (s1 && !s2) {
        roundWinnerId = p1;
      } else if (!s1 && s2) {
        roundWinnerId = p2;
      } else if (s1 && s2) {
        if (s1 !== s2) {
          if (s1 === "ROCK") roundWinnerId = s2 === "SCISSORS" ? p1 : p2;
          else if (s1 === "PAPER") roundWinnerId = s2 === "ROCK" ? p1 : p2;
          else if (s1 === "SCISSORS") roundWinnerId = s2 === "PAPER" ? p1 : p2;
        }
      }

      const fr: FinalRoundResult = {
        roundNumber: this.rpsRound,
        p1Selection: s1 as FinalChoice | null,
        p2Selection: s2 as FinalChoice | null,
        winnerId: roundWinnerId
      };
      this.finalDuelResults.push(fr);

      // RPS 점수 업데이트
      if (fr.winnerId) {
        this.rpsScores[fr.winnerId] = (this.rpsScores[fr.winnerId] ?? 0) + 1;
        for (const p of this.players) {
          if (p.id === fr.winnerId) p.score = this.rpsScores[p.id];
        }
      }

      // 2점 달성 여부 확인
      const finalWinnerId = Object.entries(this.rpsScores).find(([, s]) => s >= 2)?.[0] ?? null;
      if (finalWinnerId) {
        this.winnerId = finalWinnerId;
        // REVEAL 후 GAME_OVER
      }
    } else {
      // 일반 미니게임 결과를 레거시 roundResults에도 기록 (UNIQUE_SLOT)
      if (runtime.type === 'UNIQUE_SLOT') {
        const uState = this.currentMinigameState as UniqueSlotState;
        const rr: RoundResult = {
          roundNumber: runtime.round,
          slotCount: uState.slotCount,
          selections: this.players.map(p => ({
            playerId: p.id,
            nickname: p.nickname,
            slotSelected: uState.selections[p.id] ?? null,
            isAliveAfterRound: result.survivors.includes(p.id)
          })),
          aliveCountAfterRound: result.isVoid
            ? this.players.filter(p => p.isAlive).length
            : result.survivors.length,
          isWipeout: result.isVoid
        };
        this.roundResults.push(rr);
      }
    }

    // 플레이어 생존 상태 업데이트
    if (!result.isVoid) {
      for (const p of this.players) {
        if (result.eliminated.includes(p.id)) p.isAlive = false;
      }
      this.consecutiveVoidCount = 0;
    } else {
      this.consecutiveVoidCount++;
      this.consecutiveWipeCount++;
    }

    this.lastMinigameType = runtime.type;
    if (runtime.type === 'SHAPE_DECEPTION') {
      const sdState = this.currentMinigameState as ShapeDeceptionState;
      this.lastQuestionerIds = sdState.lastQuestionerIds;
    }
  }

  private async afterReveal() {
    // 결과 화면으로 전환
    this.gameState = GameState.MINIGAME_RESULT;
    this.currentMinigameRuntime = this.currentMinigameRuntime
      ? { ...this.currentMinigameRuntime, phase: 'RESULT' }
      : null;

    const aliveCount = this.players.filter(p => p.isAlive).length;

    if (this.winnerId) {
      // 우승자 확정
      this.gameState = GameState.GAME_OVER;
      this.clearAllTimers();
      return;
    }

    // 4초 후 다음 미니게임 또는 종료
    this.scheduleTask("NEXT_MINIGAME", Date.now() + 4000, { phase: 'NEXT' });
  }

  // ─────────────────────────────────────────────
  // 알람 기반 태스크 실행
  // ─────────────────────────────────────────────
  async alarm(): Promise<void> {
    const now = Date.now();
    const due = this.scheduledTasks.filter(t => t.executeAt <= now);

    due.sort((a, b) => a.executeAt - b.executeAt);
    for (const task of due) {
      this.scheduledTasks = this.scheduledTasks.filter(t => t.id !== task.id);
      await this.executeTask(task);
    }

    await this.saveToStorage();
    await this.setNextAlarm();
    await this.broadcastRoomState();
  }

  private async executeTask(task: ScheduledTask) {
    switch (task.type) {
      case "MINIGAME_TIMEOUT":
      case "FINAL_DUEL_TIMEOUT": {
        if (this.gameState !== GameState.PLAYING && this.gameState !== GameState.FINAL_DUEL) return;

        // RPS: 타임아웃 시 자동 판정
        if (this.currentMinigameRuntime?.type === 'ROCK_PAPER_SCISSORS') {
          const rpsState = this.currentMinigameState as RpsState | null;
          if (!rpsState) return;
          // 미제출자는 null 유지 → resolve에서 처리
        }

        await this.resolveMinigame();
        break;
      }

      case "REVEAL_COMPLETE": {
        if (this.gameState !== GameState.REVEALING) return;
        await this.afterReveal();
        break;
      }

      case "NEXT_MINIGAME": {
        if (task.data?.phase === 'START_PLAYING') {
          // 인트로 종료 → 실제 게임 시작
          await this.beginPlayingPhase();
        } else if (task.data?.phase === 'NEXT') {
          // 결과 화면 종료 → 다음 미니게임 또는 RPS 결승
          const aliveCount = this.players.filter(p => p.isAlive).length;

          if (aliveCount <= 1) {
            if (aliveCount === 1) {
              this.winnerId = this.players.find(p => p.isAlive)!.id;
            }
            this.gameState = GameState.GAME_OVER;
            this.clearAllTimers();
          } else if (aliveCount === 2 && this.currentMinigameRuntime?.type !== 'ROCK_PAPER_SCISSORS') {
            // 2명 남으면 RPS 결승
            this.rpsRound = 1;
            this.rpsScores = {};
            for (const p of this.players.filter(p => p.isAlive)) p.score = 0;
            await this.startMinigame('ROCK_PAPER_SCISSORS');
          } else if (aliveCount === 2 && this.currentMinigameRuntime?.type === 'ROCK_PAPER_SCISSORS') {
            // RPS 무승부 → 다음 라운드
            if (!this.winnerId) {
              this.rpsRound++;
              const rpsPlayers = this.players.filter(p => p.isAlive);
              const newRpsState = RPS_GAME.createInitialState(rpsPlayers);
              // 기존 scores 유지
              (newRpsState as RpsState).scores = { ...this.rpsScores };
              (newRpsState as RpsState).round = this.rpsRound;
              this.currentMinigameState = newRpsState;
              this.currentMinigameRuntime = {
                ...this.currentMinigameRuntime!,
                instanceId: newRpsState.instanceId,
                startedAt: Date.now(),
                endsAt: Date.now() + (parseInt(this.env.ROUND_DURATION_MS, 10) || 15000),
                round: this.currentRound,
                phase: 'PLAYING'
              };
              this.finalSelections = {};
              this.roundStartedAt = Date.now();
              this.roundEndsAt = this.currentMinigameRuntime.endsAt;
              this.gameState = GameState.FINAL_DUEL;
              this.scheduleTask("FINAL_DUEL_TIMEOUT", this.roundEndsAt);
            }
          } else {
            // 3명 이상 → 다음 일반 미니게임
            await this.startNextMinigame();
          }
        }
        break;
      }

      case "NEXT_ROUND": {
        // 레거시 호환 (기존 COUNTDOWN 상태)
        await this.startNextMinigame();
        break;
      }

      case "DISCONNECT_EXPIRE": {
        const pid = task.data?.playerId;
        if (!pid) return;
        const p = this.players.find(pl => pl.id === pid);
        if (p && p.disconnectedAt !== null) {
          await this.removePlayer(pid);
        }
        break;
      }

      case "EMPTY_ROOM_CLEANUP": {
        if (this.players.length === 0) {
          await this.state.storage.deleteAll();
        }
        break;
      }
    }
  }

  private async removePlayer(playerId: string) {
    this.players = this.players.filter(p => p.id !== playerId);
    delete this.sessions[playerId];

    if (this.players.length === 0) {
      const ttl = parseInt(this.env.EMPTY_ROOM_TTL_MS, 10) || 30000;
      this.scheduleTask("EMPTY_ROOM_CLEANUP", Date.now() + ttl);
    } else if (this.hostPlayerId === playerId && this.players.length > 0) {
      this.players[0].isHost = true;
      this.hostPlayerId = this.players[0].id;
    }
  }

  // ─────────────────────────────────────────────
  // 스케줄링 헬퍼
  // ─────────────────────────────────────────────
  private scheduleTask(type: ScheduledTaskType, executeAt: number, data?: any) {
    const existing = this.scheduledTasks.find(t => t.type === type);
    if (existing) {
      existing.executeAt = executeAt;
      existing.data = data;
    } else {
      this.scheduledTasks.push({ id: generateInstanceId(), type, executeAt, data });
    }

    if (this.env.IS_LOCAL === "true") {
      if (this.localAlarmTimeout) clearTimeout(this.localAlarmTimeout);
      const delay = Math.max(0, executeAt - Date.now());
      this.localAlarmTimeout = setTimeout(async () => {
        await this.alarm();
      }, delay);
    }
  }

  private async setNextAlarm() {
    if (this.scheduledTasks.length === 0) return;
    const next = Math.min(...this.scheduledTasks.map(t => t.executeAt));
    if (this.env.IS_LOCAL !== "true") {
      await this.state.storage.setAlarm(next);
    }
  }

  private cancelTaskByType(type: ScheduledTaskType) {
    this.scheduledTasks = this.scheduledTasks.filter(t => t.type !== type);
  }

  private cancelTaskByPlayerId(type: ScheduledTaskType, playerId: string) {
    this.scheduledTasks = this.scheduledTasks.filter(
      t => !(t.type === type && t.data?.playerId === playerId)
    );
  }

  private clearAllTimers() {
    this.scheduledTasks = this.scheduledTasks.filter(
      t => t.type === "DISCONNECT_EXPIRE" || t.type === "EMPTY_ROOM_CLEANUP"
    );
    if (this.localAlarmTimeout) {
      clearTimeout(this.localAlarmTimeout);
      this.localAlarmTimeout = null;
    }
  }

  // ─────────────────────────────────────────────
  // 브로드캐스트
  // ─────────────────────────────────────────────
  private async broadcastRoomState() {
    const websockets = this.state.getWebSockets();
    const alivePlayers = this.players.filter(p => p.isAlive);

    // 레거시 submittedCount 계산
    let legacySubmittedCount = 0;
    if (this.gameState === GameState.PLAYING && this.currentMinigameRuntime?.type === 'UNIQUE_SLOT') {
      legacySubmittedCount = alivePlayers.filter(p => this.selections[p.id] !== undefined && this.selections[p.id] !== null).length;
    } else if (this.gameState === GameState.FINAL_DUEL) {
      legacySubmittedCount = alivePlayers.filter(p => this.finalSelections[p.id] !== undefined && this.finalSelections[p.id] !== null).length;
    }

    // 현재 미니게임 공개 뷰
    let currentMinigamePublic = null;
    if (this.currentMinigameRuntime && this.currentMinigameState) {
      const phase = this.currentMinigameRuntime.phase as 'PLAYING' | 'REVEALING' | 'RESULT';
      try {
        currentMinigamePublic = getController(this.currentMinigameRuntime.type)
          .createPublicView(this.currentMinigameState as any, phase);
        // submittedCount를 레거시 필드에도 동기화
        if ('submittedCount' in currentMinigamePublic) {
          legacySubmittedCount = (currentMinigamePublic as any).submittedCount;
        }
      } catch {}
    }

    // 미니게임 인트로 정보
    let minigameIntroInfo: MinigameIntroInfo | null = null;
    if (this.gameState === GameState.MINIGAME_INTRO && this.currentMinigameRuntime) {
      const t = this.currentMinigameRuntime.type;
      minigameIntroInfo = {
        type: t,
        displayName: MINIGAME_DISPLAY_NAMES[t],
        description: MINIGAME_DESCRIPTIONS[t],
        durationSec: Math.ceil((parseInt(this.env.ROUND_DURATION_MS, 10) || 15000) / 1000),
        aliveCount: alivePlayers.length
      };
    }

    const publicView: PublicRoomView = {
      roomCode: this.roomCode,
      gameState: this.gameState,
      players: this.players,
      hostPlayerId: this.hostPlayerId,
      currentRound: this.currentRound,
      selectableSlotCount: this.selectableSlotCount,
      roundStartedAt: this.roundStartedAt,
      roundEndsAt: this.roundEndsAt,
      consecutiveWipeCount: this.consecutiveWipeCount,
      winnerId: this.winnerId,
      roundResults: this.roundResults,
      finalDuelResults: this.finalDuelResults,
      submittedCount: legacySubmittedCount,
      currentMinigame: currentMinigamePublic,
      minigameIntroInfo,
      minigameResults: this.minigameResults,
      minigameQueue: this.minigameQueue,
      serverTimestamp: Date.now(),
    };

    for (const ws of websockets) {
      const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
      if (!attachment) continue;

      const pId = attachment.playerId;
      const token = this.sessions[pId] || "";

      // 미니게임 개인 뷰 생성
      let minigamePrivate = null;
      if (this.currentMinigameRuntime && this.currentMinigameState) {
        const phase = this.currentMinigameRuntime.phase as 'PLAYING' | 'REVEALING' | 'RESULT';
        try {
          minigamePrivate = getController(this.currentMinigameRuntime.type)
            .createPrivateView(this.currentMinigameState as any, pId, phase);
        } catch {}
      }

      // FINAL_DUEL 상태에서 상대방 선택 은닉화 (결과 공개 전)
      const isRevealing = this.gameState === GameState.REVEALING;
      const finalChoiceSelection = isRevealing || this.gameState === GameState.GAME_OVER
        ? (this.finalSelections[pId] as FinalChoice | null ?? null)
        : (this.finalSelections[pId] as FinalChoice | null ?? null);

      const privateView: PrivatePlayerView = {
        playerId: pId,
        currentSelection: this.selections[pId] ?? null,
        finalChoiceSelection: finalChoiceSelection,
        sessionToken: token,
        minigamePrivate
      };

      const payload: GameRoomPayload = { room: publicView, me: privateView };
      const response: ServerMessage = { type: "ROOM_STATE", payload };

      try {
        ws.send(JSON.stringify(response));
      } catch (e) {}
    }
  }

  private sendError(ws: WebSocket, message: string) {
    try {
      ws.send(JSON.stringify({ type: "ERROR", message } satisfies ServerMessage));
    } catch {}
  }
}

// ─────────────────────────────────────────────
// Cloudflare Worker 라우터 (Pages Function 포워딩)
// ─────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/room/create")) {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let roomCode = "";
      const arr = new Uint8Array(6);
      crypto.getRandomValues(arr);
      for (const b of arr) roomCode += chars[b % chars.length];

      return new Response(JSON.stringify({ roomCode }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": env.ALLOWED_ORIGINS || "*"
        }
      });
    }

    if (url.pathname.startsWith("/room/join/") || url.pathname.startsWith("/room/status/")) {
      const match = url.pathname.match(/\/room\/(?:join|status)\/([A-Z0-9]{6})/i);
      if (!match) return new Response("방 코드 형식 오류", { status: 400 });

      const roomCode = match[1].toUpperCase();
      const doId = env.GAME_ROOMS.idFromName(roomCode);
      const stub = env.GAME_ROOMS.get(doId);
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};
