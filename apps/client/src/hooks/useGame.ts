import { useState, useEffect, useRef, useCallback } from "react";
import { 
  GameState, 
  FinalChoice, 
  Player, 
  RoundResult, 
  FinalRoundResult, 
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
  submitSelection: (slot: number) => void;
  submitFinalChoice: (choice: FinalChoice) => void;
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

  // API 및 WebSocket 주소 헬퍼
  const getUrls = useCallback((roomCode?: string) => {
    const isHttps = window.location.protocol === "https:";
    const host = window.location.host; // 로컬 wrangler dev(8788) 혹은 프로덕션 dev 주소 자동 바인딩
    
    const httpProtocol = isHttps ? "https://" : "http://";
    const wsProtocol = isHttps ? "wss://" : "ws://";

    return {
      createUrl: `${httpProtocol}${host}/room/create`,
      wsUrl: roomCode ? `${wsProtocol}${host}/room/join/${roomCode.toUpperCase()}` : ""
    };
  }, []);

  // 소켓 연결 함수
  const connectSocket = useCallback((roomCode: string, onConnect?: () => void) => {
    if (socketRef.current) {
      socketRef.current.close();
    }

    const { wsUrl } = getUrls(roomCode);
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      if (onConnect) onConnect();

      // DO CPU 정지(Freeze) 방지용 핑 하트비트 작동 (5초 간격)
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
          
          // 세션 정보 로컬 저장
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
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      // 의도치 않은 종료 시 재접속 시도
      reconnectTimeoutRef.current = window.setTimeout(() => {
        const savedCode = localStorage.getItem("lastChoice_roomCode");
        const savedPlayerId = localStorage.getItem("lastChoice_playerId");
        const savedToken = localStorage.getItem("lastChoice_sessionToken");
        
        if (savedCode && savedPlayerId && savedToken) {
          connectSocket(savedCode, () => {
            sendJson({
              type: "RECONNECT",
              roomCode: savedCode,
              playerId: savedPlayerId,
              sessionToken: savedToken
            });
          });
        }
      }, 2000);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };
  }, [getUrls]);

  // 로컬 세션 복원 시도
  useEffect(() => {
    const savedCode = localStorage.getItem("lastChoice_roomCode");
    const savedPlayerId = localStorage.getItem("lastChoice_playerId");
    const savedToken = localStorage.getItem("lastChoice_sessionToken");

    if (savedCode && savedPlayerId && savedToken) {
      connectSocket(savedCode, () => {
        sendJson({
          type: "RECONNECT",
          roomCode: savedCode,
          playerId: savedPlayerId,
          sessionToken: savedToken
        });
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };
  }, [connectSocket]);

  const sendJson = (msg: ClientMessage) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
    } else {
      setError("서버와의 연결이 원활하지 않습니다.");
    }
  };

  // 방 생성 API
  const createRoom = async (nickname: string): Promise<string> => {
    try {
      const { createUrl } = getUrls();
      const res = await fetch(createUrl, { method: "POST" });
      if (!res.ok) throw new Error("방 코드를 발급받지 못했습니다.");
      
      const { roomCode } = await res.json();
      
      connectSocket(roomCode, () => {
        sendJson({
          type: "CREATE_ROOM",
          nickname
        });
      });

      return roomCode;
    } catch (err: any) {
      setError(err.message || "방 생성 중 에러가 발생했습니다.");
      throw err;
    }
  };

  // 방 참가 API
  const joinRoom = (roomCode: string, nickname: string) => {
    connectSocket(roomCode, () => {
      sendJson({
        type: "JOIN_ROOM",
        roomCode,
        nickname
      });
    });
  };

  const toggleReady = () => {
    sendJson({ type: "TOGGLE_READY" });
  };

  const startGame = () => {
    sendJson({ type: "START_GAME" });
  };

  const submitSelection = (slot: number) => {
    sendJson({ type: "SUBMIT_SELECTION", slot });
  };

  const submitFinalChoice = (choice: FinalChoice) => {
    sendJson({ type: "SUBMIT_FINAL_CHOICE", choice });
  };

  const leaveRoom = () => {
    sendJson({ type: "LEAVE_ROOM" });
    // 세션 초기화
    localStorage.removeItem("lastChoice_playerId");
    localStorage.removeItem("lastChoice_sessionToken");
    localStorage.removeItem("lastChoice_roomCode");
    setRoom(null);
    setMe(null);
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
    }
  };

  const playAgain = () => {
    sendJson({ type: "PLAY_AGAIN" });
  };

  return {
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
  };
}
