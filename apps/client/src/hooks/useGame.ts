import { useState, useEffect, useRef, useCallback } from "react";
import { 
  GameState, 
  FinalChoice,
  DrawingStroke,
  Player, 
  PublicRoomView, 
  PrivatePlayerView, 
  GameRoomPayload, 
  ClientMessage, 
  ServerMessage 
} from "../../../../packages/shared/src/types.ts";

export interface UseGameReturn {
  room: PublicRoomView | null;
  me: PrivatePlayerView | null;
  isConnected: boolean;
  error: string | null;
  clearError: () => void;
  createRoom: (nickname: string) => Promise<string>;
  joinRoom: (roomCode: string, nickname: string) => void;
  toggleReady: () => void;
  startGame: () => void;

  // UNIQUE_SLOT
  submitSelection: (slot: number, instanceId?: string) => void;

  // MINORITY_BUTTON
  submitMinorityButton: (buttonId: string, instanceId: string) => void;

  // SHAPE_DECEPTION
  submitShapeGuess: (optionId: string, instanceId: string) => void;
  sendShapeChat: (message: string, instanceId: string) => void;
  sendDrawingStrokes: (strokes: DrawingStroke[], instanceId: string) => void;
  clearDrawing: (instanceId: string) => void;

  // RPS 결승
  submitFinalChoice: (choice: FinalChoice, instanceId?: string) => void;

  leaveRoom: () => void;
  playAgain: () => void;
}

export function useGame(): UseGameReturn {
  const [room, setRoom] = useState<PublicRoomView | null>(null);
  const [me, setMe] = useState<PrivatePlayerView | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const getUrls = useCallback((roomCode?: string) => {
    const isHttps = window.location.protocol === "https:";
    const host = window.location.host;
    const httpProtocol = isHttps ? "https://" : "http://";
    const wsProtocol = isHttps ? "wss://" : "ws://";
    return {
      createUrl: `${httpProtocol}${host}/room/create`,
      wsUrl: roomCode ? `${wsProtocol}${host}/room/join/${roomCode.toUpperCase()}` : ""
    };
  }, []);

  const connectSocket = useCallback((roomCode: string, onConnect?: () => void) => {
    if (socketRef.current) socketRef.current.close();

    const { wsUrl } = getUrls(roomCode);
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      if (onConnect) onConnect();

      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "PING" }));
        }
      }, 5000);
    };

    ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        if (message.type === "ROOM_STATE") {
          const payload: GameRoomPayload = message.payload;
          setRoom(payload.room);
          setMe(payload.me);
          localStorage.setItem("lastChoice_playerId", payload.me.playerId);
          localStorage.setItem("lastChoice_sessionToken", payload.me.sessionToken);
          localStorage.setItem("lastChoice_roomCode", payload.room.roomCode);
        } else if (message.type === "ERROR") {
          setError(message.message);
        }
      } catch (err) {
        console.error("Message parsing error:", err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      reconnectTimeoutRef.current = window.setTimeout(() => {
        const savedCode = localStorage.getItem("lastChoice_roomCode");
        const savedPlayerId = localStorage.getItem("lastChoice_playerId");
        const savedToken = localStorage.getItem("lastChoice_sessionToken");
        if (savedCode && savedPlayerId && savedToken) {
          connectSocket(savedCode, () => {
            sendJson({ type: "RECONNECT", roomCode: savedCode, playerId: savedPlayerId, sessionToken: savedToken });
          });
        }
      }, 2000);
    };

    ws.onerror = (err) => console.error("WebSocket error:", err);
  }, [getUrls]);

  useEffect(() => {
    const savedCode = localStorage.getItem("lastChoice_roomCode");
    const savedPlayerId = localStorage.getItem("lastChoice_playerId");
    const savedToken = localStorage.getItem("lastChoice_sessionToken");

    if (savedCode && savedPlayerId && savedToken) {
      connectSocket(savedCode, () => {
        sendJson({ type: "RECONNECT", roomCode: savedCode, playerId: savedPlayerId, sessionToken: savedToken });
      });
    }

    return () => {
      if (socketRef.current) socketRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [connectSocket]);

  const sendJson = (msg: ClientMessage) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
    } else {
      setError("서버와의 연결이 원활하지 않습니다.");
    }
  };

  const createRoom = async (nickname: string): Promise<string> => {
    try {
      const { createUrl } = getUrls();
      const res = await fetch(createUrl, { method: "POST" });
      if (!res.ok) throw new Error("방 코드를 발급받지 못했습니다.");
      const { roomCode } = await res.json();
      connectSocket(roomCode, () => sendJson({ type: "CREATE_ROOM", nickname }));
      return roomCode;
    } catch (err: any) {
      setError(err.message || "방 생성 중 에러가 발생했습니다.");
      throw err;
    }
  };

  const joinRoom = (roomCode: string, nickname: string) => {
    connectSocket(roomCode, () => sendJson({ type: "JOIN_ROOM", roomCode, nickname }));
  };

  const toggleReady = () => sendJson({ type: "TOGGLE_READY" });
  const startGame = () => sendJson({ type: "START_GAME" });

  const submitSelection = (slot: number, instanceId?: string) =>
    sendJson({ type: "SUBMIT_SELECTION", slot, minigameInstanceId: instanceId });

  const submitMinorityButton = (buttonId: string, instanceId: string) =>
    sendJson({ type: "SUBMIT_MINORITY_BUTTON", minigameInstanceId: instanceId, buttonId });

  const submitShapeGuess = (optionId: string, instanceId: string) =>
    sendJson({ type: "SUBMIT_SHAPE_GUESS", minigameInstanceId: instanceId, optionId });

  const sendShapeChat = (message: string, instanceId: string) =>
    sendJson({ type: "SEND_SHAPE_CHAT", minigameInstanceId: instanceId, message });

  const sendDrawingStrokes = (strokes: DrawingStroke[], instanceId: string) =>
    sendJson({ type: "SEND_DRAWING_STROKES", minigameInstanceId: instanceId, strokes });

  const clearDrawing = (instanceId: string) =>
    sendJson({ type: "CLEAR_DRAWING", minigameInstanceId: instanceId });

  const submitFinalChoice = (choice: FinalChoice, instanceId?: string) =>
    sendJson({ type: "SUBMIT_FINAL_CHOICE", choice, minigameInstanceId: instanceId });

  const leaveRoom = () => {
    sendJson({ type: "LEAVE_ROOM" });
    localStorage.removeItem("lastChoice_playerId");
    localStorage.removeItem("lastChoice_sessionToken");
    localStorage.removeItem("lastChoice_roomCode");
    setRoom(null);
    setMe(null);
    if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
    if (socketRef.current) socketRef.current.close();
  };

  const playAgain = () => sendJson({ type: "PLAY_AGAIN" });

  return {
    room, me, isConnected, error, clearError,
    createRoom, joinRoom, toggleReady, startGame,
    submitSelection, submitMinorityButton, submitShapeGuess,
    sendShapeChat, sendDrawingStrokes, clearDrawing,
    submitFinalChoice, leaveRoom, playAgain
  };
}
