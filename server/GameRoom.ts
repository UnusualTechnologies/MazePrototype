import { Room } from "colyseus";
import { type Client } from "@colyseus/core";
import { GameState, Player, Cell, PowerUp } from "./GameState.ts";

export class GameRoom extends Room<GameState> {
    maxClients = 8;
    cols = 20;
    rows = 20;

    onCreate(options: any) {
        const state = new GameState();
        state.cols = this.cols;
        state.rows = this.rows;
        state.goalX = Math.floor(this.cols / 2);
        state.goalY = Math.floor(this.rows / 2);
        this.setState(state);
        this.generateMaze();
        this.spawnPowerUps();
        
        this.setSimulationInterval((dt) => {
            this.state.timer += dt / 1000;
        });

        this.onMessage("move", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            // Update position
            player.x = message.x;
            player.y = message.y;

            // Check Power-Up collection
            const puIndex = this.state.powerUps.findIndex(pu => pu.x === player.x && pu.y === player.y);
            if (puIndex !== -1) {
                const pu = this.state.powerUps[puIndex];
                this.state.powerUps.splice(puIndex, 1);

                if (pu.type === "opponents") {
                    // Teleport all other players
                    this.state.players.forEach((p, sid) => {
                        if (sid !== client.sessionId) {
                            this.teleportPlayer(p);
                        }
                    });
                } else if (pu.type === "self") {
                    // Teleport self
                    this.teleportPlayer(player);
                } else if (pu.type === "rocket") {
                    // Rocket logic could be added here later
                }
            }

            // Check Player-Player collisions
            this.state.players.forEach((other, sid) => {
                if (sid !== client.sessionId && other.x === player.x && other.y === player.y) {
                    this.teleportPlayer(player);
                    this.teleportPlayer(other);
                }
            });

            // Check Goal
            if (player.x === this.state.goalX && player.y === this.state.goalY) {
                // Handle win logic on server if needed, 
                // for now we'll let the client detect win but server resets or increments score
                player.score++;
                // Potentially reset round here
            }
        });
        
        console.log("Room created:", this.roomId);
    }

    teleportPlayer(player: Player) {
        let rx, ry;
        let isValid = false;
        while (!isValid) {
            rx = Math.floor(Math.random() * this.cols);
            ry = Math.floor(Math.random() * this.rows);
            isValid = true;
            if (rx === this.state.goalX && ry === this.state.goalY) isValid = false;
            // Avoid spawning on existing power-ups
            if (this.state.powerUps.some(pu => pu.x === rx && pu.y === ry)) isValid = false;
        }
        player.x = rx;
        player.y = ry;
    }

    generateMaze() {
        this.state.grid.clear();
        // Initialize Grid
        for (let x = 0; x < this.cols; x++) {
            for (let y = 0; y < this.rows; y++) {
                this.state.grid.push(new Cell());
            }
        }

        const visited = new Array(this.cols * this.rows).fill(false);
        const stack: {x: number, y: number}[] = [{x: 0, y: 0}];
        visited[0] = true;

        while (stack.length > 0) {
            let current = stack[stack.length - 1];
            let neighbors = this.getUnvisitedNeighbors(current.x, current.y, visited);

            if (neighbors.length > 0) {
                let next = neighbors[Math.floor(Math.random() * neighbors.length)];
                this.removeWalls(current.x, current.y, next.x, next.y);
                visited[next.x * this.rows + next.y] = true;
                stack.push(next);
            } else {
                stack.pop();
            }
        }
    }

    getUnvisitedNeighbors(x: number, y: number, visited: boolean[]) {
        let n: {x: number, y: number}[] = [];
        if (y > 0 && !visited[x * this.rows + (y - 1)]) n.push({x, y: y - 1});
        if (x < this.cols - 1 && !visited[(x + 1) * this.rows + y]) n.push({x: x + 1, y});
        if (y < this.rows - 1 && !visited[x * this.rows + (y + 1)]) n.push({x, y: y + 1});
        if (x > 0 && !visited[(x - 1) * this.rows + y]) n.push({x: x - 1, y});
        return n;
    }

    removeWalls(x1: number, y1: number, x2: number, y2: number) {
        const cell1 = this.state.grid[x1 * this.rows + y1];
        const cell2 = this.state.grid[x2 * this.rows + y2];
        let dx = x1 - x2;
        if (dx === 1) { cell1.walls[3] = false; cell2.walls[1] = false; }
        else if (dx === -1) { cell1.walls[1] = false; cell2.walls[3] = false; }

        let dy = y1 - y2;
        if (dy === 1) { cell1.walls[0] = false; cell2.walls[2] = false; }
        else if (dy === -1) { cell1.walls[2] = false; cell2.walls[0] = false; }
    }

    spawnPowerUps() {
        this.state.powerUps.clear();
        const count = 20;
        for (let i = 0; i < count; i++) {
            const pu = new PowerUp();
            pu.x = Math.floor(Math.random() * this.cols);
            pu.y = Math.floor(Math.random() * this.rows);
            const types = ["opponents", "self", "rocket"];
            pu.type = types[Math.floor(Math.random() * types.length)];
            this.state.powerUps.push(pu);
        }
    }

    onJoin(client: Client, options: any) {
        const player = new Player();
        player.id = client.id;
        // Start positions: 4 corners
        const corners = [
            {x: 0, y: 0},
            {x: this.cols - 1, y: 0},
            {x: 0, y: this.rows - 1},
            {x: this.cols - 1, y: this.rows - 1}
        ];
        const pos = corners[this.state.players.size % corners.length];
        player.x = pos.x;
        player.y = pos.y;
        
        const playerColors = [
            '#ff0055', '#ff8800', '#ffee00', '#00ff22',
            '#00ffff', '#4466ff', '#aa00ff', '#ff00ff'
        ];
        player.color = playerColors[this.state.players.size % playerColors.length];

        this.state.players.set(client.sessionId, player);
        console.log(`Player ${client.id} joined room ${this.roomId}`);
    }

    onLeave(client: Client) {
        this.state.players.delete(client.sessionId);
        console.log(`Player ${client.id} left room ${this.roomId}`);
    }
}
