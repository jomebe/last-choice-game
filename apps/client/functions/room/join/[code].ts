export interface Env {
  GAME_ROOMS: DurableObjectNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/room\/join\/([A-Z0-9]{6})$/i);

  if (match) {
    const roomCode = match[1].toUpperCase();
    const doId = env.GAME_ROOMS.idFromName(roomCode);
    const stub = env.GAME_ROOMS.get(doId);
    return stub.fetch(request);
  }

  return new Response("Not Found", { status: 404 });
};
