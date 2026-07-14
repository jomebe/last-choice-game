import { z } from "zod";

export enum GameState {
  LOBBY = "LOBBY",
  COUNTDOWN = "COUNTDOWN",
  SELECTING = "SELECTING",
  REVEALING = "REVEALING",
  ROUND_RESULT = "ROUND_RESULT",
  FINAL_DUEL = "FINAL_DUEL",
  GAME_OVER = "GAME_OVER"
}

export enum FinalSymbol {
  SHADOW_CIRCLE = "SHADOW_CIRCLE",       // 검은 원 (붉은 사각형에 지고, 흰 삼각형을 이김)
  PRISM_TRIANGLE = "PRISM_TRIANGLE",     // 흰 삼각형 (검은 원에 지고, 붉은 사각형을 이김)
  CRIMSON_SQUARE = "CRIMSON_SQUARE"      // 붉은 사각형 (흰 삼각형에 지고, 검은 원을 이김)
}

export const FinalSymbolBeats: Record<FinalSymbol, FinalSymbol> = {
  [FinalSymbol.SHADOW_CIRCLE]: FinalSymbol.PRISM_TRIANGLE,
  [FinalSymbol.PRISM_TRIANGLE]: FinalSymbol.CRIMSON_SQUARE,
  [FinalSymbol.CRIMSON_SQUARE]: FinalSymbol.SHADOW_CIRCLE,
};

export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
  isAlive: boolean;
  score: number; // 결승전용 점수
  disconnectedAt: number | null; // null이면 온라인, 타임스탬프면 오프라인 상태
}

// 라운드 결과 세부 사항 (REVEALING 또는 ROUND_RESULT 시점에 공개)
export interface RoundSelectionInfo {
  playerId: string;
  nickname: string;
  slotSelected: number | null; // 선택 안 했으면 null
  isAliveAfterRound: boolean;
}

export interface RoundResult {
  roundNumber: number;
  slotCount: number;
  selections: RoundSelectionInfo[];
  aliveCountAfterRound: number;
  isWipeout: boolean; // 전원 탈락 여부
}

// 결승전 라운드 결과 세부 사항
export interface FinalRoundResult {
  roundNumber: number;
  p1Selection: FinalSymbol;
  p2Selection: FinalSymbol;
  winnerId: string | null; // null이면 무승부
}

// 모든 클라이언트가 수신할 수 있는 공용 뷰포트 상태
export interface PublicRoomView {
  roomCode: string;
  gameState: GameState;
  players: Player[];
  hostPlayerId: string;
  currentRound: number;
  selectableSlotCount: number;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  consecutiveWipeCount: number;
  winnerId: string | null;
  roundResults: RoundResult[];
  finalDuelResults: FinalRoundResult[];
  
  // SELECTING 상태에서 클라이언트들에게 "몇 명이 선택했는지"만 실시간으로 카운트 표시하기 위함
  submittedCount: number;
}

// 개별 플레이어가 수신하는 비공개 뷰포트 상태
export interface PrivatePlayerView {
  playerId: string;
  currentSelection: number | null; // 현재 진행 중인 라운드의 내 선택 (결과 공개 전까지 본인에게만 복구용)
  finalSymbolSelection: FinalSymbol | null; // 결승전에서 본인의 선택
  sessionToken: string; // 최초 접속 또는 재접속 시 확인용
}

export interface GameRoomPayload {
  room: PublicRoomView;
  me: PrivatePlayerView;
}

// --- WebSocket Client to Server Zod Schema ---

export const ClientMsgCreateSchema = z.object({
  type: z.literal("CREATE_ROOM"),
  nickname: z.string().min(2).max(12).regex(/^[a-zA-Z0-9가-힣\s-_]+$/)
});

export const ClientMsgJoinSchema = z.object({
  type: z.literal("JOIN_ROOM"),
  roomCode: z.string().length(6),
  nickname: z.string().min(2).max(12).regex(/^[a-zA-Z0-9가-힣\s-_]+$/)
});

export const ClientMsgStartGameSchema = z.object({
  type: z.literal("START_GAME")
});

export const ClientMsgToggleReadySchema = z.object({
  type: z.literal("TOGGLE_READY")
});

export const ClientMsgSubmitSelectionSchema = z.object({
  type: z.literal("SUBMIT_SELECTION"),
  slot: z.number().int().positive()
});

export const ClientMsgSubmitFinalSelectionSchema = z.object({
  type: z.literal("SUBMIT_FINAL_SELECTION"),
  symbol: z.nativeEnum(FinalSymbol)
});

export const ClientMsgReconnectSchema = z.object({
  type: z.literal("RECONNECT"),
  roomCode: z.string().length(6),
  playerId: z.string(),
  sessionToken: z.string()
});

export const ClientMsgLeaveRoomSchema = z.object({
  type: z.literal("LEAVE_ROOM")
});

export const ClientMsgPlayAgainSchema = z.object({
  type: z.literal("PLAY_AGAIN")
});

export const ClientMsgPingSchema = z.object({
  type: z.literal("PING")
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  ClientMsgCreateSchema,
  ClientMsgJoinSchema,
  ClientMsgStartGameSchema,
  ClientMsgToggleReadySchema,
  ClientMsgSubmitSelectionSchema,
  ClientMsgSubmitFinalSelectionSchema,
  ClientMsgReconnectSchema,
  ClientMsgLeaveRoomSchema,
  ClientMsgPlayAgainSchema,
  ClientMsgPingSchema
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// --- WebSocket Server to Client Zod Schema (검증 및 전송 보증용) ---

export const ServerMsgRoomStateSchema = z.object({
  type: z.literal("ROOM_STATE"),
  payload: z.custom<GameRoomPayload>()
});

export const ServerMsgErrorSchema = z.object({
  type: z.literal("ERROR"),
  message: z.string()
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  ServerMsgRoomStateSchema,
  ServerMsgErrorSchema
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
