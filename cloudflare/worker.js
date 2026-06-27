export default {
  async fetch(request, env) {
    // Only allow GET
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Forward the path/query straight to api.roobet.com
    const url = new URL(request.url);
    const roobetUrl = `https://api.roobet.com${url.pathname}${url.search}`;

    let response;
    try {
      response = await fetch(roobetUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${env.ROOBET_API_TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Upstream fetch failed: ${err.message}` }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};
