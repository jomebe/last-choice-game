export const onRequestGet: PagesFunction = async (context) => {
  return new Response(JSON.stringify({ status: "OK", timestamp: Date.now() }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
};
