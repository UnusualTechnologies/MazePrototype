import http from "http";
import express from "express";
import { Server } from "colyseus";
import { GameRoom } from "./GameRoom.ts";
const port = Number(process.env.PORT || 2567);
const app = express();
const server = http.createServer(app);
const gameServer = new Server({ server });
gameServer.define("game", GameRoom);
gameServer.listen(port).then(() => {
    console.log(`Listening on ws://localhost:${port}`);
});
//# sourceMappingURL=index.js.map