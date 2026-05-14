import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom.ts";

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const gameServer = new Server({
    transport: new WebSocketTransport({ server })
});

gameServer.define("game", GameRoom);

gameServer.listen(port).then(() => {
    console.log(`Listening on ws://localhost:${port}`);
    if (typeof process.send === "function") process.send("ready");
});
