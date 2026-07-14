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
} from "../../../packages/shared/src/types.ts";
import { GameEngine } from "../../../packages/shared/src/engine/GameEngine.ts";

export interface Env {
  GAME_ROOMS: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
  ROUND_DURATION_MS: string;
  REVEAL_DURATION_MS: string;
  DISCONNECT_GRACE_MS: string;
  EMPTY_ROOM_TTL_MS: string;
  IS_LOCAL?: string;
}

// --- WebSocket Attachment 정의 ---
interface WebSocketAttachment {
  playerId: string;
  sessionId: string;
  roomCode: string;
  connectedAt: number;
}

// --- DO 알람 예약 작업 정의 ---
interface ScheduledTask {
  id: string;
  type: "ROUND_TIMEOUT" | "REVEAL_COMPLETE" | "NEXT_ROUND" | "DISCONNECT_EXPIRE" | "EMPTY_ROOM_CLEANUP" | "FINAL_DUEL_TIMEOUT";
  executeAt: number;
  data?: any;
}

// --- Durable Object GameRoom 클래스 정의 ---
export class GameRoom implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  
  private roomCode: string = "";
  private players: Player[] = [];
  private hostPlayerId: string = "";
  private gameState: GameState = GameState.LOBBY;
  private currentRound: number = 0;
  private selectableSlotCount: number = 0;
  
  private selections: Record<string, number | null> = {};
  private finalSelections: Record<string, FinalSymbol | null> = {};
  
  private roundStartedAt: number | null = null;
  private roundEndsAt: number | null = null;
  private consecutiveWipeCount: number = 0;
  private winnerId: string | null = null;
  
  private roundResults: RoundResult[] = [];
  private finalDuelResults: FinalRoundResult[] = [];
  
  private scheduledTasks: ScheduledTask[] = [];
  private sessions: Record<string, string> = {};
  private localAlarmTimeout: any = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    
    this.state.blockConcurrencyWhile(async () => {
      await this.loadFromStorage();
    });
  }

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

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // 방 코드 파싱하여 세팅
    const match = url.pathname.match(/\/room\/join\/([A-Z0-9]{6})/i);
    if (match && !this.roomCode) {
      this.roomCode = match[1].toUpperCase();
    }
    
    if (url.pathname.includes("/status")) {
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

    const { 0: client, 1: server } = new WebSocketPair();
    
    // WebSocket Hibernation 활성화
    this.state.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
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

      // 일괄 저장 및 알람 예약 및 브로드캐스트 전송
      await this.saveToStorage();
      await this.setNextAlarm();
      await this.broadcastRoomState();
    } catch (err: any) {
      this.sendError(ws, "서버 오류: " + err.message);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
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

  async webSocketError(ws: WebSocket, error: any): Promise<void> {
    await this.webSocketClose(ws, 1006, "Error occurred", false);
  }

  private async handleAnonymousAction(msg: ClientMessage, ws: WebSocket) {
    if (msg.type === "CREATE_ROOM") {
      const playerId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const sessionToken = crypto.randomUUID();
      
      // 방 코드는 fetch 시점에 추출된 것을 그대로 유지함
      const newPlayer: Player = {
        id: playerId,
        nickname: msg.nickname,
        isHost: true,
        isReady: true,
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

      player.disconnectedAt = null;
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

  private async handleUserAction(playerId: string, msg: ClientMessage, ws: WebSocket) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      this.sendError(ws, "해당 플레이어 세션이 유효하지 않습니다.");
      return;
    }

    if (msg.type === "TOGGLE_READY") {
      if (this.gameState !== GameState.LOBBY) return;
      if (player.isHost) {
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

      const nonHostPlayers = this.players.filter(p => !p.isHost);
      const allReady = nonHostPlayers.every(p => p.isReady);
      if (!allReady) {
        this.sendError(ws, "모든 플레이어가 준비 완료되어야 시작할 수 있습니다.");
        return;
      }

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

      // 2명 시작 규칙: 즉시 결승전 진입
      if (this.players.length === 2) {
        this.gameState = GameState.FINAL_DUEL;
        this.selectableSlotCount = 0;
        await this.saveToStorage();
        await this.broadcastRoomState();
        
        const duration = parseInt(this.env.ROUND_DURATION_MS, 10) || 15000;
        this.roundStartedAt = Date.now();
        this.roundEndsAt = Date.now() + duration;
        await this.saveToStorage();
        await this.broadcastRoomState();
        this.scheduleTask("FINAL_DUEL_TIMEOUT", this.roundEndsAt);
      } else {
        this.gameState = GameState.COUNTDOWN;
        this.selectableSlotCount = this.players.length;
        await this.saveToStorage();
        await this.broadcastRoomState();

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

      this.selections[player.id] = slot;
      await this.saveToStorage();
      await this.broadcastRoomState();

      const alivePlayers = this.players.filter(p => p.isAlive);
      const allSubmitted = alivePlayers.every(p => this.selections[p.id] !== undefined && this.selections[p.id] !== null);
      
      if (allSubmitted) {
        this.cancelTaskByType("ROUND_TIMEOUT");
        await this.executeTask({
          id: crypto.randomUUID(),
          type: "ROUND_TIMEOUT",
          executeAt: Date.now()
        });
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

      const finalPlayers = this.players.filter(p => p.isAlive);
      const allSubmitted = finalPlayers.every(p => this.finalSelections[p.id] !== undefined && this.finalSelections[p.id] !== null);

      if (allSubmitted) {
        this.cancelTaskByType("FINAL_DUEL_TIMEOUT");
        await this.executeTask({
          id: crypto.randomUUID(),
          type: "FINAL_DUEL_TIMEOUT",
          executeAt: Date.now()
        });
      }
    }

    else if (msg.type === "LEAVE_ROOM") {
      await this.removePlayer(player.id);
    }

    else if (msg.type === "PLAY_AGAIN") {
      if (this.gameState !== GameState.GAME_OVER) return;
      
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
        p.isReady = p.id === this.hostPlayerId;
        p.score = 0;
      }

      await this.saveToStorage();
      await this.broadcastRoomState();
    }
    
    else if (msg.type === "PING") {
      // 핑 요청 수신 시 단순히 연결 유지만 하고 DB 쓰기 부하를 방지하기 위해 빈 즉시 반환 처리
      return;
    }
  }

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
      const cleanupGrace = parseInt(this.env.EMPTY_ROOM_TTL_MS, 10) || 30000;
      this.scheduleTask("EMPTY_ROOM_CLEANUP", Date.now() + cleanupGrace);
    } else {
      if (removedPlayer.isHost) {
        this.players[0].isHost = true;
        this.players[0].isReady = true;
        this.hostPlayerId = this.players[0].id;
      }

      const alivePlayers = this.players.filter(p => p.isAlive);
      if (this.gameState !== GameState.LOBBY && this.gameState !== GameState.GAME_OVER) {
        if (alivePlayers.length === 1) {
          this.winnerId = alivePlayers[0].id;
          this.gameState = GameState.GAME_OVER;
          this.clearAllTimers();
        } else if (alivePlayers.length === 0) {
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

  private async setNextAlarm() {
    if (this.scheduledTasks.length === 0) {
      await this.state.storage.deleteAlarm();
      return;
    }

    const futureTasks = this.scheduledTasks.filter(t => t.executeAt > Date.now());
    if (futureTasks.length === 0) {
      await this.state.storage.setAlarm(Date.now() + 1);
      return;
    }

    futureTasks.sort((a, b) => a.executeAt - b.executeAt);
    const earliest = futureTasks[0];
    await this.state.storage.setAlarm(earliest.executeAt);
  }

  private scheduleTask(type: ScheduledTask["type"], executeAt: number, data?: any) {
    const id = crypto.randomUUID();
    
    if (type !== "DISCONNECT_EXPIRE") {
      this.cancelTaskByType(type);
    }
    
    this.scheduledTasks.push({ id, type, executeAt, data });
  }

  private cancelTaskByType(type: ScheduledTask["type"]) {
    this.scheduledTasks = this.scheduledTasks.filter(t => t.type !== type);
  }

  private cancelTaskByPlayerId(type: ScheduledTask["type"], playerId: string) {
    this.scheduledTasks = this.scheduledTasks.filter(t => !(t.type === type && t.data?.playerId === playerId));
  }

  async alarm(): Promise<void> {
    await this.loadFromStorage();
    
    const now = Date.now();
    const tasksToExecute = this.scheduledTasks.filter(t => t.executeAt <= now + 50);
    
    if (tasksToExecute.length === 0) {
      await this.setNextAlarm();
      return;
    }

    tasksToExecute.sort((a, b) => a.executeAt - b.executeAt);

    for (const task of tasksToExecute) {
      try {
        await this.executeTask(task);
      } catch (err) {
        console.error("Task execution error:", err);
      }
      this.scheduledTasks = this.scheduledTasks.filter(t => t.id !== task.id);
    }

    await this.saveToStorage();
    await this.broadcastRoomState();
    await this.setNextAlarm();
  }

  private async executeTask(task: ScheduledTask) {
    switch (task.type) {
      case "NEXT_ROUND": {
        const alivePlayers = this.players.filter(p => p.isAlive);
        if (alivePlayers.length === 2) {
          // 결승전 다음 라운드 시작
          this.gameState = GameState.FINAL_DUEL;
          this.finalSelections = {};
          
          const duration = parseInt(this.env.ROUND_DURATION_MS, 10) || 15000;
          this.roundStartedAt = Date.now();
          this.roundEndsAt = Date.now() + duration;

          this.scheduleTask("FINAL_DUEL_TIMEOUT", this.roundEndsAt);
        } else {
          // 일반 다음 라운드 시작
          this.gameState = GameState.SELECTING;
          this.selections = {};
          
          const duration = parseInt(this.env.ROUND_DURATION_MS, 10) || 15000;
          this.roundStartedAt = Date.now();
          this.roundEndsAt = Date.now() + duration;

          this.scheduleTask("ROUND_TIMEOUT", this.roundEndsAt);
        }
        break;
      }
      case "ROUND_TIMEOUT": {
        if (this.gameState !== GameState.SELECTING) return;
        
        // 로컬 환경 가상 시간 순간이동 대응: 미제출자가 있으면 판정을 보류하고 리턴
        if (this.env.IS_LOCAL === "true") {
          const alivePlayers = this.players.filter(p => p.isAlive);
          const allSubmitted = alivePlayers.every(p => this.selections[p.id] !== undefined && this.selections[p.id] !== null);
          if (!allSubmitted) return;
        }

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
        this.gameState = GameState.REVEALING;
        
        const revealDuration = parseInt(this.env.REVEAL_DURATION_MS, 10) || 5000;
        this.roundStartedAt = Date.now();
        this.roundEndsAt = Date.now() + revealDuration;

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
          this.currentRound++;
          this.scheduleTask("NEXT_ROUND", Date.now() + 4000);
        } else if (this.gameState === GameState.FINAL_DUEL) {
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

        // 로컬 환경 가상 시간 순간이동 대응: 결승 미제출자가 있으면 판정을 보류하고 리턴
        if (this.env.IS_LOCAL === "true") {
          const finalPlayers = this.players.filter(p => p.isAlive);
          const allSubmitted = finalPlayers.every(p => this.finalSelections[p.id] !== undefined && this.finalSelections[p.id] !== null);
          if (!allSubmitted) return;
        }

        console.log(`[DurableObject] 결승 R${this.currentRound} 판정 시작: finalSelections =`, JSON.stringify(this.finalSelections));
        console.log(`[DurableObject] players =`, JSON.stringify(this.players.map(p => ({ id: p.id, name: p.nickname, score: p.score }))));

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

        console.log(`[DurableObject] 결승 R${this.currentRound} 판정 완료: nextState = ${nextState}, winnerId = ${winnerId}`);

        this.players = nextPlayers;
        this.finalDuelResults.push(result);
        this.winnerId = winnerId;
        
        if (nextState === GameState.GAME_OVER) {
          this.gameState = GameState.GAME_OVER;
          this.clearAllTimers();
        } else {
          this.gameState = GameState.ROUND_RESULT;
          this.currentRound++; // 다음 결승 라운드로 카운트 증가
          this.scheduleTask("NEXT_ROUND", Date.now() + 4000);
        }
        break;
      }
      case "DISCONNECT_EXPIRE": {
        const playerId = task.data?.playerId;
        if (!playerId) return;

        const player = this.players.find(p => p.id === playerId);
        if (player && player.disconnectedAt !== null) {
          await this.removePlayer(playerId);
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

  private async broadcastRoomState() {
    const websockets = this.state.getWebSockets();
    
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

    for (const ws of websockets) {
      const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
      if (!attachment) continue;

      const pId = attachment.playerId;
      const token = this.sessions[pId] || "";

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
      } catch (e) {}
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

  private generateRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

// --- Cloudflare Worker Routing Handler ---
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS 프리플라이트 대응
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Upgrade",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    // 헬스체크
    if (url.pathname === "/status" && request.headers.get("Upgrade") !== "websocket") {
      return new Response(JSON.stringify({ status: "OK", timestamp: Date.now() }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 방 생성 (REST API)
    if (url.pathname === "/room/create" && request.method === "POST") {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "";
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return new Response(JSON.stringify({ roomCode: code }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // WebSocket 업그레이드 매핑 (/room/join/ABCDEF)
    const match = url.pathname.match(/^\/room\/join\/([A-Z0-9]{6})$/i);
    if (match) {
      const roomCode = match[1].toUpperCase();
      const doId = env.GAME_ROOMS.idFromName(roomCode);
      const stub = env.GAME_ROOMS.get(doId);
      return stub.fetch(request);
    }

    // 앗! 만약 API 엔드포인트도 아니고 WebSocket 연결도 아니라면,
    // Pages Functions가 아니라 단일 _worker.js 구조이므로,
    // 정적 자산(Static Assets) 요청으로 에셋이 서빙되어야 합니다.
    // wrangler pages dev/deploy 환경에서는 _worker.js가 처리하지 못하는 정적 자산에 대해
    // 자동으로 fallback 처리되거나 env.ASSETS.fetch(request)를 통해 서빙할 수 있도록 넘겨줍니다.
    // (만약 Pages Bindings의 ASSETS가 존재한다면 forward 해줍니다.)
    if ((env as any).ASSETS) {
      return (env as any).ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};
