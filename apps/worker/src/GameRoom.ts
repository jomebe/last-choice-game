import { DurableObjectState } from "@cloudflare/workers-types";
import { 
  GameState, 
  FinalSymbol, 
  Player, 
  RoundResult, 
  FinalRoundResult, 
  PublicRoomView, 
  PrivatePlayerView, 
  GameRoomPayload, 
  ClientMessage,
  ClientMessageSchema,
  ServerMessage
} from "last-choice-shared";
import { GameEngine } from "./engine/GameEngine.js";

export interface Env {
  GAME_ROOMS: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
  ROUND_DURATION_MS: string;
  REVEAL_DURATION_MS: string;
  DISCONNECT_GRACE_MS: string;
  EMPTY_ROOM_TTL_MS: string;
}

interface WebSocketAttachment {
  playerId: string;
  sessionId: string;
  roomCode: string;
  connectedAt: number;
}

interface ScheduledTask {
  id: string;
  type: "ROUND_TIMEOUT" | "REVEAL_COMPLETE" | "NEXT_ROUND" | "DISCONNECT_EXPIRE" | "EMPTY_ROOM_CLEANUP" | "FINAL_DUEL_TIMEOUT";
  executeAt: number;
  data?: any;
}

export class GameRoom implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  
  // Storage에 영구 저장될 영구 상태 (Durable Object Storage API 활용)
  private roomCode: string = "";
  private players: Player[] = [];
  private hostPlayerId: string = "";
  private gameState: GameState = GameState.LOBBY;
  private currentRound: number = 0;
  private selectableSlotCount: number = 0;
  
  // 라운드 진행 중 제출된 비공개 선택들 (결과 공개 전까지 절대 외부에 노출 금지)
  // key: playerId -> 선택한 번호
  private selections: Record<string, number | null> = {};
  // key: playerId -> 선택한 결승 심볼
  private finalSelections: Record<string, FinalSymbol | null> = {};
  
  private roundStartedAt: number | null = null;
  private roundEndsAt: number | null = null;
  private consecutiveWipeCount: number = 0;
  private winnerId: string | null = null;
  
  // 라운드 및 결승 결과 기록
  private roundResults: RoundResult[] = [];
  private finalDuelResults: FinalRoundResult[] = [];
  
  // 예약 작업 목록
  private scheduledTasks: ScheduledTask[] = [];
  
  // 세션 정보 관리 (playerId -> sessionToken)
  private sessions: Record<string, string> = {};

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    
    // 비동기 복구 작업이 끝날 때까지 메시지 접수를 보류
    this.state.blockConcurrencyWhile(async () => {
      await this.loadFromStorage();
    });
  }

  // Storage로부터 복구
  private async loadFromStorage() {
    this.roomCode = (await this.state.storage.get<string>("roomCode")) || "";
    this.players = (await this.state.storage.get<Player[]>("players")) || [];
    this.hostPlayerId = (await this.state.storage.get<string>("hostPlayerId")) || "";
    this.gameState = (await this.state.storage.get<GameState>("gameState")) || GameState.LOBBY;
    this.currentRound = (await this.state.storage.get<number>("currentRound")) || 0;
    this.selectableSlotCount = (await this.state.storage.get<number>("selectableSlotCount")) || 0;
    this.selections = (await this.state.storage.get<Record<string, number | null>>("selections")) || {};
    this.finalSelections = (await this.state.storage.get<Record<string, FinalSymbol | null>>("finalSelections")) || {};
    this.roundStartedAt = (await this.state.storage.get<number | null>("roundStartedAt")) || null;
    this.roundEndsAt = (await this.state.storage.get<number | null>("roundEndsAt")) || null;
    this.consecutiveWipeCount = (await this.state.storage.get<number>("consecutiveWipeCount")) || 0;
    this.winnerId = (await this.state.storage.get<string | null>("winnerId")) || null;
    this.roundResults = (await this.state.storage.get<RoundResult[]>("roundResults")) || [];
    this.finalDuelResults = (await this.state.storage.get<FinalRoundResult[]>("finalDuelResults")) || [];
    this.scheduledTasks = (await this.state.storage.get<ScheduledTask[]>("scheduledTasks")) || [];
    this.sessions = (await this.state.storage.get<Record<string, string>>("sessions")) || {};
  }

  // Storage에 영구 저장
  private async saveToStorage() {
    await this.state.storage.put("roomCode", this.roomCode);
    await this.state.storage.put("players", this.players);
    await this.state.storage.put("hostPlayerId", this.hostPlayerId);
    await this.state.storage.put("gameState", this.gameState);
    await this.state.storage.put("currentRound", this.currentRound);
    await this.state.storage.put("selectableSlotCount", this.selectableSlotCount);
    await this.state.storage.put("selections", this.selections);
    await this.state.storage.put("finalSelections", this.finalSelections);
    await this.state.storage.put("roundStartedAt", this.roundStartedAt);
    await this.state.storage.put("roundEndsAt", this.roundEndsAt);
    await this.state.storage.put("consecutiveWipeCount", this.consecutiveWipeCount);
    await this.state.storage.put("winnerId", this.winnerId);
    await this.state.storage.put("roundResults", this.roundResults);
    await this.state.storage.put("finalDuelResults", this.finalDuelResults);
    await this.state.storage.put("scheduledTasks", this.scheduledTasks);
    await this.state.storage.put("sessions", this.sessions);
  }

  // Fetch 요청 핸들러 (HTTP 및 WS 업그레이드 진입)
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // 헬스체크 및 방 상태 확인용 디버그 엔드포인트
    if (url.pathname === "/status") {
      return new Response(JSON.stringify({
        roomCode: this.roomCode,
        gameState: this.gameState,
        playersCount: this.players.length,
        alivePlayers: this.players.filter(p => p.isAlive).length,
        currentRound: this.currentRound
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket connection expected", { status: 426 });
    }

    // CORS Origin 체크
    const origin = request.headers.get("Origin");
    if (this.env.ALLOWED_ORIGINS !== "*") {
      const allowed = this.env.ALLOWED_ORIGINS.split(",").map(o => o.trim());
      if (origin && !allowed.includes(origin)) {
        return new Response("CORS Blocked", { status: 403 });
      }
    }

    const { 0: client, 1: server } = new WebSocketPair();
    
    // WebSocket Hibernation 활성화
    this.state.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  // --- WebSocket Hibernation Event Handlers ---

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    
    try {
      const rawData = JSON.parse(message);
      const parsed = ClientMessageSchema.safeParse(rawData);
      if (!parsed.success) {
        this.sendError(ws, "올바르지 않은 메시지 규격입니다. (" + parsed.error.message + ")");
        return;
      }

      const clientMsg = parsed.data;
      
      // RECONNECT 처리 제외한 일반 요청은 attachment 확인 필요
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
    } catch (err: any) {
      this.sendError(ws, "서버 오류: " + err.message);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    if (!attachment) return;

    // 플레이어 오프라인 처리
    const player = this.players.find(p => p.id === attachment.playerId);
    if (player) {
      player.disconnectedAt = Date.now();
      await this.saveToStorage();
      await this.broadcastRoomState();

      // 재접속 대기 유예 시간 Alarm 등록
      const graceMs = parseInt(this.env.DISCONNECT_GRACE_MS, 10) || 10000;
      this.scheduleTask("DISCONNECT_EXPIRE", Date.now() + graceMs, { playerId: player.id });
    }
  }

  async webSocketError(ws: WebSocket, error: any): Promise<void> {
    // 에러 발생 시 Close와 마찬가지로 이탈 처리 수행
    await this.webSocketClose(ws, 1006, "Error occurred", false);
  }

  // --- 비로그인 시 수행 가능한 동작 ---
  private async handleAnonymousAction(msg: ClientMessage, ws: WebSocket) {
    if (msg.type === "CREATE_ROOM") {
      const playerId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const sessionToken = crypto.randomUUID();
      
      this.roomCode = this.generateRoomCode();
      const newPlayer: Player = {
        id: playerId,
        nickname: msg.nickname,
        isHost: true,
        isReady: true, // 방장은 기본 준비완료
        isAlive: true,
        score: 0,
        disconnectedAt: null
      };

      this.players = [newPlayer];
      this.hostPlayerId = playerId;
      this.sessions[playerId] = sessionToken;
      this.gameState = GameState.LOBBY;
      this.currentRound = 0;
      this.roundResults = [];
      this.finalDuelResults = [];
      
      ws.serializeAttachment({
        playerId,
        sessionId,
        roomCode: this.roomCode,
        connectedAt: Date.now()
      });

      await this.saveToStorage();
      await this.broadcastRoomState();
      
      // 방 정리 타이머 취소 (플레이어가 있으므로)
      this.cancelTaskByType("EMPTY_ROOM_CLEANUP");
    }

    else if (msg.type === "JOIN_ROOM") {
      const normalizedCode = msg.roomCode.toUpperCase();
      if (this.roomCode && this.roomCode !== normalizedCode) {
        this.sendError(ws, "존재하지 않는 방 코드입니다.");
        return;
      }

      if (this.gameState !== GameState.LOBBY) {
        this.sendError(ws, "이미 게임이 진행 중인 방입니다. 로비 상태에서만 참가할 수 있습니다.");
        return;
      }

      if (this.players.length >= 9) {
        this.sendError(ws, "방의 최대 인원(9명)이 초과되었습니다.");
        return;
      }

      const nicknameExists = this.players.some(p => p.nickname === msg.nickname);
      if (nicknameExists) {
        this.sendError(ws, "이미 사용 중인 닉네임입니다.");
        return;
      }

      const playerId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const sessionToken = crypto.randomUUID();

      const newPlayer: Player = {
        id: playerId,
        nickname: msg.nickname,
        isHost: false,
        isReady: false,
        isAlive: true,
        score: 0,
        disconnectedAt: null
      };

      this.players.push(newPlayer);
      this.sessions[playerId] = sessionToken;
      
      ws.serializeAttachment({
        playerId,
        sessionId,
        roomCode: this.roomCode,
        connectedAt: Date.now()
      });

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

      // 복구
      player.disconnectedAt = null;
      
      // 혹시 돌아온 유저에 대해 만료 태스크가 걸려 있다면 취소
      this.cancelTaskByPlayerId("DISCONNECT_EXPIRE", player.id);
      
      const sessionId = crypto.randomUUID();
      ws.serializeAttachment({
        playerId: player.id,
        sessionId,
        roomCode: this.roomCode,
        connectedAt: Date.now()
      });

      await this.saveToStorage();
      await this.broadcastRoomState();
      this.cancelTaskByType("EMPTY_ROOM_CLEANUP");
    }
  }

  // --- 로그인 상태의 플레이어가 수행하는 액션 ---
  private async handleUserAction(playerId: string, msg: ClientMessage, ws: WebSocket) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      this.sendError(ws, "해당 플레이어 세션이 유효하지 않습니다.");
      return;
    }

    if (msg.type === "TOGGLE_READY") {
      if (this.gameState !== GameState.LOBBY) return;
      if (player.isHost) {
        // 방장은 항상 준비 완료 상태
        player.isReady = true;
      } else {
        player.isReady = !player.isReady;
      }
      await this.saveToStorage();
      await this.broadcastRoomState();
    }

    else if (msg.type === "START_GAME") {
      if (this.gameState !== GameState.LOBBY) return;
      if (!player.isHost) {
        this.sendError(ws, "방장만 게임을 시작할 수 있습니다.");
        return;
      }

      const activePlayers = this.players.filter(p => !p.disconnectedAt);
      if (activePlayers.length < 2) {
        this.sendError(ws, "게임 시작을 위해서는 최소 2명의 참가자가 필요합니다.");
        return;
      }

      // 방장을 제외한 모든 플레이어가 준비 완료했는지 검사
      const nonHostPlayers = this.players.filter(p => !p.isHost);
      const allReady = nonHostPlayers.every(p => p.isReady);
      if (!allReady) {
        this.sendError(ws, "모든 플레이어가 준비 완료되어야 시작할 수 있습니다.");
        return;
      }

      // 최초 생존자 및 칸수 세팅
      for (const p of this.players) {
        p.isAlive = true;
        p.score = 0;
      }
      this.currentRound = 1;
      this.roundResults = [];
      this.finalDuelResults = [];
      this.selections = {};
      this.finalSelections = {};
      this.winnerId = null;

      // 2명 시작 규칙: 정확히 2명이면 즉시 결승전으로 진입
      if (this.players.length === 2) {
        this.gameState = GameState.FINAL_DUEL;
        this.selectableSlotCount = 0;
        await this.saveToStorage();
        await this.broadcastRoomState();
        
        // 결승전 라운드 시작 예약
        const duration = parseInt(this.env.ROUND_DURATION_MS, 10) || 15000;
        this.roundStartedAt = Date.now();
        this.roundEndsAt = Date.now() + duration;
        await this.saveToStorage();
        await this.broadcastRoomState();
        this.scheduleTask("FINAL_DUEL_TIMEOUT", this.roundEndsAt);
      } else {
        // 3명 이상인 경우 일반 카운트다운 진입
        this.gameState = GameState.COUNTDOWN;
        this.selectableSlotCount = this.players.length;
        await this.saveToStorage();
        await this.broadcastRoomState();

        // 3초 카운트다운 후 라운드 선택 시작 예약
        this.scheduleTask("NEXT_ROUND", Date.now() + 3000);
      }
    }

    else if (msg.type === "SUBMIT_SELECTION") {
      if (this.gameState !== GameState.SELECTING) {
        this.sendError(ws, "현재는 번호를 선택할 수 있는 단계가 아닙니다.");
        return;
      }
      if (!player.isAlive) {
        this.sendError(ws, "탈락한 플레이어는 선택할 수 없습니다.");
        return;
      }
      
      const slot = msg.slot;
      if (slot < 1 || slot > this.selectableSlotCount) {
        this.sendError(ws, "선택 범위를 초과하는 칸 번호입니다.");
        return;
      }

      // 비공개 선택 제출 및 갱신
      this.selections[player.id] = slot;
      await this.saveToStorage();
      await this.broadcastRoomState();

      // 생존자 전원 선택 제출했는지 확인
      const alivePlayers = this.players.filter(p => p.isAlive);
      const allSubmitted = alivePlayers.every(p => this.selections[p.id] !== undefined && this.selections[p.id] !== null);
      
      if (allSubmitted) {
        // 모든 생존자 선택 완료 시 1초 뒤 자동 라운드 종료
        this.cancelTaskByType("ROUND_TIMEOUT");
        this.scheduleTask("ROUND_TIMEOUT", Date.now() + 1000);
      }
    }

    else if (msg.type === "SUBMIT_FINAL_SELECTION") {
      if (this.gameState !== GameState.FINAL_DUEL) {
        this.sendError(ws, "현재는 결승 심볼을 선택할 수 있는 단계가 아닙니다.");
        return;
      }
      if (!player.isAlive) {
        this.sendError(ws, "결승 진출자가 아닌 플레이어는 선택할 수 없습니다.");
        return;
      }

      this.finalSelections[player.id] = msg.symbol;
      await this.saveToStorage();
      await this.broadcastRoomState();

      // 두 플레이어 모두 선택했는지 검사
      const finalPlayers = this.players.filter(p => p.isAlive);
      const allSubmitted = finalPlayers.every(p => this.finalSelections[p.id] !== undefined && this.finalSelections[p.id] !== null);

      if (allSubmitted) {
        this.cancelTaskByType("FINAL_DUEL_TIMEOUT");
        this.scheduleTask("FINAL_DUEL_TIMEOUT", Date.now() + 1000);
      }
    }

    else if (msg.type === "LEAVE_ROOM") {
      await this.removePlayer(player.id);
    }

    else if (msg.type === "PLAY_AGAIN") {
      if (this.gameState !== GameState.GAME_OVER) return;
      
      // 로비 상태로 초기화
      this.gameState = GameState.LOBBY;
      this.currentRound = 0;
      this.selectableSlotCount = 0;
      this.selections = {};
      this.finalSelections = {};
      this.winnerId = null;
      this.roundResults = [];
      this.finalDuelResults = [];
      this.consecutiveWipeCount = 0;
      
      for (const p of this.players) {
        p.isAlive = true;
        p.isReady = p.id === this.hostPlayerId; // 방장은 ready 기본값 true, 타인은 false
        p.score = 0;
      }

      await this.saveToStorage();
      await this.broadcastRoomState();
    }
  }

  // 플레이어 제거 처리 (방장 위임 포함)
  private async removePlayer(playerId: string) {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index === -1) return;

    const removedPlayer = this.players[index];
    this.players.splice(index, 1);
    delete this.sessions[playerId];
    delete this.selections[playerId];
    delete this.finalSelections[playerId];

    this.cancelTaskByPlayerId("DISCONNECT_EXPIRE", playerId);

    if (this.players.length === 0) {
      // 플레이어가 하나도 없으면 빈 방 정리 태스크 설정
      const cleanupGrace = parseInt(this.env.EMPTY_ROOM_TTL_MS, 10) || 30000;
      this.scheduleTask("EMPTY_ROOM_CLEANUP", Date.now() + cleanupGrace);
    } else {
      // 방장이 나간 경우
      if (removedPlayer.isHost) {
        // 남은 플레이어 중 가장 먼저 들어온 사람(0번째 인덱스)에게 호스트 인계
        this.players[0].isHost = true;
        this.players[0].isReady = true; // 강제 ready
        this.hostPlayerId = this.players[0].id;
      }

      // 게임 도중 인원이 탈락/이탈하여 더 이상 플레이가 불가능할 때 예외 대응
      const alivePlayers = this.players.filter(p => p.isAlive);
      if (this.gameState !== GameState.LOBBY && this.gameState !== GameState.GAME_OVER) {
        if (alivePlayers.length === 1) {
          // 1명만 남은 경우 즉시 우승
          this.winnerId = alivePlayers[0].id;
          this.gameState = GameState.GAME_OVER;
          this.clearAllTimers();
        } else if (alivePlayers.length === 0) {
          // 다 나가버린 경우 게임 오버
          this.gameState = GameState.GAME_OVER;
          this.clearAllTimers();
        }
      }

      await this.saveToStorage();
      await this.broadcastRoomState();
    }
  }

  private clearAllTimers() {
    this.scheduledTasks = [];
    this.roundStartedAt = null;
    this.roundEndsAt = null;
  }

  // --- Durable Object Alarm 스케줄러 구현 ---

  // 다음 실행시점을 찾아 알람 예약
  private async setNextAlarm() {
    if (this.scheduledTasks.length === 0) {
      await this.state.storage.deleteAlarm();
      return;
    }

    // 미래의 작업 중 가장 이른 것
    const futureTasks = this.scheduledTasks.filter(t => t.executeAt > Date.now());
    if (futureTasks.length === 0) {
      // 이미 지났거나 지금 당장 해야 하는 작업이 있다면 1ms 뒤에 실행되도록 예약
      await this.state.storage.setAlarm(Date.now() + 1);
      return;
    }

    futureTasks.sort((a, b) => a.executeAt - b.executeAt);
    const earliest = futureTasks[0];
    await this.state.storage.setAlarm(earliest.executeAt);
  }

  private scheduleTask(type: ScheduledTask["type"], executeAt: number, data?: any) {
    const id = crypto.randomUUID();
    
    // 만약 동일한 type에 대한 단일성 예약 작업이라면 기존의 예약을 취소
    if (type !== "DISCONNECT_EXPIRE") {
      this.cancelTaskByType(type);
    }
    
    this.scheduledTasks.push({ id, type, executeAt, data });
    this.state.blockConcurrencyWhile(async () => {
      await this.saveToStorage();
      await this.setNextAlarm();
    });
  }

  private cancelTaskByType(type: ScheduledTask["type"]) {
    this.scheduledTasks = this.scheduledTasks.filter(t => t.type !== type);
  }

  private cancelTaskByPlayerId(type: ScheduledTask["type"], playerId: string) {
    this.scheduledTasks = this.scheduledTasks.filter(t => !(t.type === type && t.data?.playerId === playerId));
  }

  // 알람 핸들러
  async alarm(): Promise<void> {
    await this.loadFromStorage();
    
    const now = Date.now();
    // 현재 기준 실행 시점이 도달한 작업들 선별
    const tasksToExecute = this.scheduledTasks.filter(t => t.executeAt <= now + 50); // 50ms 오차 인정
    
    if (tasksToExecute.length === 0) {
      await this.setNextAlarm();
      return;
    }

    // 작업 정렬 후 순차 멱등 실행
    tasksToExecute.sort((a, b) => a.executeAt - b.executeAt);

    for (const task of tasksToExecute) {
      try {
        await this.executeTask(task);
      } catch (err) {
        console.error("Task execution error:", err);
      }
      // 실행 완료 후 제거
      this.scheduledTasks = this.scheduledTasks.filter(t => t.id !== task.id);
    }

    await this.saveToStorage();
    await this.broadcastRoomState();
    await this.setNextAlarm();
  }

  private async executeTask(task: ScheduledTask) {
    switch (task.type) {
      case "NEXT_ROUND": {
        // 라운드 선택 단계 시작
        this.gameState = GameState.SELECTING;
        this.selections = {};
        
        const duration = parseInt(this.env.ROUND_DURATION_MS, 10) || 15000;
        this.roundStartedAt = Date.now();
        this.roundEndsAt = Date.now() + duration;

        // 타임아웃 강제 판정 태스크 예약
        this.scheduleTask("ROUND_TIMEOUT", this.roundEndsAt);
        break;
      }
      case "ROUND_TIMEOUT": {
        if (this.gameState !== GameState.SELECTING) return;
        
        // 판정 수행
        const {
          nextPlayers,
          result,
          nextState,
          nextSlotCount,
          nextConsecutiveWipeCount,
          winnerId
        } = GameEngine.processRound(
          this.players,
          this.selections,
          this.selectableSlotCount,
          this.consecutiveWipeCount,
          this.currentRound
        );

        this.players = nextPlayers;
        this.roundResults.push(result);
        this.consecutiveWipeCount = nextConsecutiveWipeCount;
        this.winnerId = winnerId;
        this.gameState = GameState.REVEALING; // 순차 공개 연출을 위해 REVEALING으로 먼저 전환
        
        const revealDuration = parseInt(this.env.REVEAL_DURATION_MS, 10) || 5000;
        this.roundStartedAt = Date.now();
        this.roundEndsAt = Date.now() + revealDuration;

        // 결과 공개 완료 후의 액션 예약
        // 만약 우승자가 나왔다면 GAME_OVER로, 2명 남았다면 결승으로, 아니면 ROUND_RESULT로
        this.scheduleTask("REVEAL_COMPLETE", this.roundEndsAt, {
          nextState,
          nextSlotCount
        });
        break;
      }
      case "REVEAL_COMPLETE": {
        if (this.gameState !== GameState.REVEALING) return;

        const data = task.data;
        const targetState = data?.nextState || GameState.ROUND_RESULT;
        const nextSlotCount = data?.nextSlotCount || this.selectableSlotCount;

        this.gameState = targetState;
        this.selectableSlotCount = nextSlotCount;

        if (this.gameState === GameState.ROUND_RESULT) {
          // 라운드 결과 화면을 보고 대기하는 3초 타이머 후 다음 라운드로 진행
          this.currentRound++;
          this.scheduleTask("NEXT_ROUND", Date.now() + 4000);
        } else if (this.gameState === GameState.FINAL_DUEL) {
          // 결승전 첫 라운드 진행
          this.currentRound = 1;
          this.finalSelections = {};
          
          const duration = parseInt(this.env.ROUND_DURATION_MS, 10) || 15000;
          this.roundStartedAt = Date.now();
          this.roundEndsAt = Date.now() + duration;

          this.scheduleTask("FINAL_DUEL_TIMEOUT", this.roundEndsAt);
        } else if (this.gameState === GameState.GAME_OVER) {
          this.clearAllTimers();
        }
        break;
      }
      case "FINAL_DUEL_TIMEOUT": {
        if (this.gameState !== GameState.FINAL_DUEL) return;

        const {
          nextPlayers,
          result,
          nextState,
          winnerId
        } = GameEngine.processFinalDuelRound(
          this.players,
          this.finalSelections,
          this.currentRound
        );

        this.players = nextPlayers;
        this.finalDuelResults.push(result);
        this.winnerId = winnerId;
        
        if (nextState === GameState.GAME_OVER) {
          this.gameState = GameState.GAME_OVER;
          this.clearAllTimers();
        } else {
          // 무승부이거나 아직 최종 우승이 안 난 경우 4초 후 다음 결승 라운드 시작
          this.gameState = GameState.ROUND_RESULT; // 결승전도 라운드 결과를 잠시 보여주기 위함
          this.scheduleTask("NEXT_ROUND", Date.now() + 4000);
        }
        break;
      }
      case "DISCONNECT_EXPIRE": {
        const playerId = task.data?.playerId;
        if (!playerId) return;

        const player = this.players.find(p => p.id === playerId);
        // 여전히 오프라인인 경우 탈락 또는 방에서 영구 삭제
        if (player && player.disconnectedAt !== null) {
          await this.removePlayer(playerId);
        }
        break;
      }
      case "EMPTY_ROOM_CLEANUP": {
        // 모든 인원이 방을 떠난 상태가 유지되면 방 정보 파기
        if (this.players.length === 0) {
          await this.state.storage.deleteAll();
        }
        break;
      }
    }
  }

  // --- 상태 전송 및 마스킹 직렬화 ---

  // 모든 연결되어 있는 클라이언트 소켓에게 상태 브로드캐스트
  private async broadcastRoomState() {
    const websockets = this.state.getWebSockets();
    
    // 1. 공용 상태 구성
    // 라운드가 REVEALING, ROUND_RESULT, GAME_OVER 단계가 아닐 때는 
    // selections 정보가 PublicRoomView에 절대 노출되면 안 됨.
    const revealStage = [GameState.REVEALING, GameState.ROUND_RESULT, GameState.GAME_OVER].includes(this.gameState);
    
    // 제출한 활성 플레이어 수 구하기
    const alivePlayers = this.players.filter(p => p.isAlive);
    let submittedCount = 0;
    if (this.gameState === GameState.SELECTING) {
      submittedCount = alivePlayers.filter(p => this.selections[p.id] !== undefined && this.selections[p.id] !== null).length;
    } else if (this.gameState === GameState.FINAL_DUEL) {
      submittedCount = alivePlayers.filter(p => this.finalSelections[p.id] !== undefined && this.finalSelections[p.id] !== null).length;
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
      submittedCount
    };

    // 2. 각 소켓별 attachment를 참조해 개인화된 상태를 조합해서 개별 전송
    for (const ws of websockets) {
      const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
      if (!attachment) continue;

      const pId = attachment.playerId;
      const token = this.sessions[pId] || "";

      // 개인 데이터
      const privateView: PrivatePlayerView = {
        playerId: pId,
        currentSelection: this.selections[pId] || null,
        finalSymbolSelection: this.finalSelections[pId] || null,
        sessionToken: token
      };

      const payload: GameRoomPayload = {
        room: publicView,
        me: privateView
      };

      const response: ServerMessage = {
        type: "ROOM_STATE",
        payload
      };

      try {
        ws.send(JSON.stringify(response));
      } catch (e) {
        // 전송 실패 시 연결 닫힘 등으로 간주하여 무시 (나중에 Close로 대응됨)
      }
    }
  }

  private sendError(ws: WebSocket, message: string) {
    const errorMsg: ServerMessage = {
      type: "ERROR",
      message
    };
    try {
      ws.send(JSON.stringify(errorMsg));
    } catch (e) {}
  }

  // --- 유틸리티 ---
  private generateRoomCode(): string {
    // 0, O, 1, I, L 제외한 대문자 영숫자
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
