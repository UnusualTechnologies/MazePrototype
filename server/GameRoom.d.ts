import { Room } from "colyseus";
import { type Client } from "@colyseus/core";
import { GameState } from "./GameState.ts";
export declare class GameRoom extends Room<GameState> {
    maxClients: number;
    onCreate(options: any): void;
    generateMaze(): void;
    onJoin(client: Client, options: any): void;
    onLeave(client: Client): void;
}
//# sourceMappingURL=GameRoom.d.ts.map