import { Env } from "./GameRoom.js";

// GameRoom 클래스를 반드시 export 해야 wrangler가 Durable Object로 매핑합니다.
export { GameRoom } from "./GameRoom.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS 프리플라이트 대응
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": env.ALLOWED_ORIGINS === "*" ? "*" : request.headers.get("Origin") || "*",
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

    // WebSocket 업그레이드 또는 REST 요청을 Durable Object로 라우팅
    // 경로 예시: /room/join/ABCDEF
    const match = url.pathname.match(/^\/room\/join\/([A-Z0-9]{6})$/i);
    
    // 방 생성 시에는 고유한 난수 방코드를 발급하고, 해당 방의 DO로 첫 소켓을 열 수 있게 가이드합니다.
    // 혹은 클라이언트가 임의의 URL(/room/create)로 POST 요청을 보내 방을 생성할 수도 있습니다.
    // 단순화하기 위해, /room/create 엔드포인트도 제공하겠습니다.
    if (url.pathname === "/room/create" && request.method === "POST") {
      // 0, O, 1, I, L 제외한 문자 조합으로 중복없는 방코드를 생성합니다.
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

    if (match) {
      const roomCode = match[1].toUpperCase();
      
      // Durable Object ID 획득
      const doId = env.GAME_ROOMS.idFromName(roomCode);
      const stub = env.GAME_ROOMS.get(doId);
      
      // Durable Object로 fetch 포워딩
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};
