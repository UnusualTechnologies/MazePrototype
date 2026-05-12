import { Room } from "colyseus";
import {} from "@colyseus/core";
import { GameState, Player } from "./GameState.ts";
export class GameRoom extends Room {
    maxClients = 4;
    onCreate(options) {
        this.setState(new GameState());
        this.generateMaze();
        // Server-side timer update
        this.setSimulationInterval((dt) => {
            this.state.timer += dt / 1000;
        });
        console.log("Room created:", this.roomId);
    }
    generateMaze() {
        // Minimal maze representation for now (e.g., 20x20 wall bitmask strings)
        for (let i = 0; i < 20; i++) {
            this.state.mazeData.push("1111".repeat(5));
        }
    }
    onJoin(client, options) {
        const player = new Player();
        player.id = client.id;
        this.state.players.set(client.id, player);
        console.log(`Player ${client.id} joined room ${this.roomId}`);
    }
    onLeave(client) {
        this.state.players.delete(client.id);
        console.log(`Player ${client.id} left room ${this.roomId}`);
    }
}
//# sourceMappingURL=GameRoom.js.map