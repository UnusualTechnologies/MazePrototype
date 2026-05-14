import colyseus, { listen } from "@colyseus/tools";
import cors from "cors";
import { GameRoom } from "./GameRoom.ts";

listen(colyseus({
    initializeGameServer: (gameServer) => {
        gameServer.define("game", GameRoom);
    },
    initializeExpress: (app) => {
        app.use(cors());
    }
}));
