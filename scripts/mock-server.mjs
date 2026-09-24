// Local API for trying Softnet by hand: `node scripts/mock-server.mjs`, then send to http://localhost:4010/users
import { createServer } from "node:http";

const users = Array.from({ length: 40 }, (_, index) => ({
  id: 9007199254740993 + index,
  name: ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Linus Torvalds"][index % 4],
  email: `user${index + 1}@example.com`,
  active: index % 3 !== 0,
  roles: index % 2 ? ["admin", "editor"] : ["viewer"],
  profile: { city: ["Pune", "London", "Berlin", "Austin"][index % 4], score: 72.5 + index, manager: null },
}));

const server = createServer((req, res) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "*",
    "Access-Control-Expose-Headers": "*",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, headers).end();
    return;
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/html") {
      res.writeHead(200, { ...headers, "Content-Type": "text/html" }).end("<h1>Hello from the mock</h1><p>Preview works.</p>");
      return;
    }
    if (url.pathname === "/missing") {
      res.writeHead(404, { ...headers, "Content-Type": "application/json" }).end('{"error":"Not found"}');
      return;
    }
    const payload = req.method === "GET" ? { page: 1, total: users.length, data: users } : { received: body ? JSON.parse(body) : null, ok: true };
    res
      .writeHead(req.method === "POST" ? 201 : 200, { ...headers, "Content-Type": "application/json; charset=utf-8", "X-Request-Id": "mock-42" })
      .end(JSON.stringify(payload));
  });
});

server.listen(4010, "127.0.0.1", () => console.log("Mock API on http://localhost:4010"));
