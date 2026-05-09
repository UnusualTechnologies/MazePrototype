import { Room, Client } from "colyseus";
import { GameState, Player, PowerUp } from "../schema/State";

const WINS_NEEDED = 3;
const TICK_RATE = 20;
const TICK_INTERVAL = 1000 / TICK_RATE;

export class GameRoom extends Room<GameState> {
    maxClients = 8;
    
    // Player colors
    playerColors = [
        '#ff0055', '#ff8800', '#ffee00', '#00ff22',
        '#00ffff', '#4466ff', '#aa00ff', '#ff00ff'
    ];

    onCreate(options: any) {
        this.setState(new GameState());
        
        // Always generate a room code
        this.state.roomCode = this.generateRoomCode();

        if (options.custom) {
            this.setPrivate(true);
        }

        this.state.cols = options.gridSize || 20;
        this.state.rows = options.gridSize || 20;
        this.state.goalX = Math.floor(this.state.cols / 2);
        this.state.goalY = Math.floor(this.state.rows / 2);
        this.state.collisionsEnabled = options.collisions !== undefined ? options.collisions : true;

        this.onMessage("move", (client, message) => {
            this.handleMove(client, message);
        });

        this.onMessage("start", (client) => {
            this.startMatch();
        });

        this.setSimulationInterval((deltaTime) => this.update(deltaTime), TICK_INTERVAL);
    }

    onJoin(client: Client, options: any) {
        console.log(client.sessionId, "joined!");
        
        const player = new Player();
        player.id = options.name || `Player ${this.clients.length}`;
        
        // Assign color
        player.color = this.playerColors[this.clients.length - 1] || "#ffffff";
        
        // Initial position (corners or sides)
        const pos = this.getStartPos(this.clients.length - 1);
        player.x = pos.x;
        player.y = pos.y;
        
        this.state.players.set(client.sessionId, player);

        // Auto-start if it's the first player
        if (this.clients.length === 1) {
            this.startMatch();
        }
    }

    onLeave(client: Client, consented: boolean) {
        console.log(client.sessionId, "left!");
        this.state.players.delete(client.sessionId);
        
        if (this.clients.length === 0) {
            // Room will be destroyed automatically
        }
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    getStartPos(index: number) {
        const cols = this.state.cols;
        const rows = this.state.rows;
        const positions = [
            {x: 0, y: 0},
            {x: cols - 1, y: 0},
            {x: 0, y: rows - 1},
            {x: cols - 1, y: rows - 1},
            {x: Math.floor(cols / 2), y: 0},
            {x: cols - 1, y: Math.floor(rows / 2)},
            {x: Math.floor(cols / 2), y: rows - 1},
            {x: 0, y: Math.floor(rows / 2)}
        ];
        return positions[index % positions.length];
    }

    startMatch() {
        this.state.status = "PLAYING";
        this.initRound();
    }

    initRound() {
        this.generateMaze();
        this.spawnPowerUps();
        
        this.state.players.forEach((player, sessionId) => {
            const index = Array.from(this.state.players.keys()).indexOf(sessionId);
            const pos = this.getStartPos(index);
            player.x = pos.x;
            player.y = pos.y;
            player.state = "normal";
            player.stateTimer = 0;
        });
        
        this.state.timer = 0;
    }

    generateMaze() {
        const cols = this.state.cols;
        const rows = this.state.rows;
        const totalCells = cols * rows;
        
        // Initialize grid with all walls (15 = 1111 binary)
        const gridData: number[] = new Array(totalCells).fill(15);
        const visited: boolean[] = new Array(totalCells).fill(false);

        const goalX = this.state.goalX;
        const goalY = this.state.goalY;
        const goalIndex = goalY * cols + goalX;

        visited[goalIndex] = true;

        const getNeighbors = (index: number) => {
            const x = index % cols;
            const y = Math.floor(index / cols);
            const neighbors = [];
            if (y > 0) neighbors.push({ index: (y - 1) * cols + x, dir: 0 }); // Top
            if (x < cols - 1) neighbors.push({ index: y * cols + (x + 1), dir: 1 }); // Right
            if (y < rows - 1) neighbors.push({ index: (y + 1) * cols + x, dir: 2 }); // Bottom
            if (x > 0) neighbors.push({ index: y * cols + (x - 1), dir: 3 }); // Left
            return neighbors;
        };

        const removeWall = (idxA: number, idxB: number, dirA: number) => {
            gridData[idxA] &= ~(1 << dirA);
            const dirB = (dirA + 2) % 4;
            gridData[idxB] &= ~(1 << dirB);
        };

        // Randomized Prim's Algorithm
        const frontier: { index: number, from: number, dir: number }[] = [];
        
        // Goal is the starting point for generation
        const goalNeighbors = getNeighbors(goalIndex);
        const firstNeighbor = goalNeighbors[Math.floor(Math.random() * goalNeighbors.length)];
        
        removeWall(goalIndex, firstNeighbor.index, firstNeighbor.dir);
        visited[firstNeighbor.index] = true;
        
        getNeighbors(firstNeighbor.index).forEach(n => {
            if (!visited[n.index]) frontier.push({ index: n.index, from: firstNeighbor.index, dir: n.dir });
        });

        while (frontier.length > 0) {
            const randIdx = Math.floor(Math.random() * frontier.length);
            const current = frontier.splice(randIdx, 1)[0];

            if (visited[current.index]) continue;

            visited[current.index] = true;
            
            // Connect to a visited neighbor
            const neighbors = getNeighbors(current.index);
            const visitedNeighbors = neighbors.filter(n => visited[n.index] && n.index !== goalIndex);
            
            if (visitedNeighbors.length > 0) {
                const vn = visitedNeighbors[Math.floor(Math.random() * visitedNeighbors.length)];
                removeWall(current.index, vn.index, vn.dir);
            }

            neighbors.forEach(n => {
                if (!visited[n.index]) frontier.push({ index: n.index, from: current.index, dir: n.dir });
            });
        }

        // Update state grid
        this.state.grid.clear();
        gridData.forEach(val => this.state.grid.push(val));
    }

    spawnPowerUps() {
        this.state.powerUps.clear();
        const count = 20; // Default total
        const types = ['opponents', 'self', 'rocket'];
        
        for (let i = 0; i < count; i++) {
            let x = Math.floor(Math.random() * this.state.cols);
            let y = Math.floor(Math.random() * this.state.rows);
            
            // Avoid goal and starting positions
            if (x === this.state.goalX && y === this.state.goalY) continue;
            
            const pu = new PowerUp();
            pu.x = x;
            pu.y = y;
            pu.type = types[Math.floor(Math.random() * types.length)];
            this.state.powerUps.push(pu);
        }
    }

    handleMove(client: Client, message: any) {
        if (this.state.status !== "PLAYING") return;
        
        const player = this.state.players.get(client.sessionId);
        if (!player || player.state !== "normal") return;

        const dx = message.dx || 0;
        const dy = message.dy || 0;

        // Only allow 1-step moves
        if (Math.abs(dx) + Math.abs(dy) !== 1) return;

        if (this.canMove(player.x, player.y, dx, dy)) {
            player.x += dx;
            player.y += dy;
            this.checkCollisions(client.sessionId, player);
            this.checkPowerUps(player);
            this.checkGoal(client.sessionId, player);
        }
    }

    canMove(x: number, y: number, dx: number, dy: number) {
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx < 0 || nx >= this.state.cols || ny < 0 || ny >= this.state.rows) return false;
        
        const index = y * this.state.cols + x;
        const walls = this.state.grid[index];
        
        if (dy === -1 && (walls & 1)) return false; // Top
        if (dx === 1 && (walls & 2)) return false;  // Right
        if (dy === 1 && (walls & 4)) return false;  // Bottom
        if (dx === -1 && (walls & 8)) return false; // Left
        
        return true;
    }

    checkCollisions(sessionId: string, player: Player) {
        if (!this.state.collisionsEnabled) return;
        
        this.state.players.forEach((other, otherId) => {
            if (sessionId !== otherId && other.state === "normal" && other.x === player.x && other.y === player.y) {
                this.teleportPlayer(player);
                this.teleportPlayer(other);
            }
        });
    }

    checkPowerUps(player: Player) {
        for (let i = 0; i < this.state.powerUps.length; i++) {
            const pu = this.state.powerUps[i];
            if (pu.x === player.x && pu.y === player.y) {
                this.applyPowerUp(player, pu.type);
                this.state.powerUps.splice(i, 1);
                break;
            }
        }
    }

    applyPowerUp(player: Player, type: string) {
        if (type === 'self') {
            this.teleportPlayer(player);
        } else if (type === 'opponents') {
            this.state.players.forEach((other) => {
                if (other !== player) this.teleportPlayer(other);
            });
        } else if (type === 'rocket') {
            // Rocket logic: for now just teleport opponents as a simple authoritative version
            // In a full implementation, we'd spawn a server-side projectile
            this.state.players.forEach((other) => {
                if (other !== player) this.teleportPlayer(other);
            });
        }
    }

    teleportPlayer(player: Player) {
        player.state = "teleport_out";
        player.stateTimer = 1000; // 1 second
        
        let rx, ry;
        do {
            rx = Math.floor(Math.random() * this.state.cols);
            ry = Math.floor(Math.random() * this.state.rows);
        } while (rx === this.state.goalX && ry === this.state.goalY);
        
        player.targetX = rx;
        player.targetY = ry;
    }

    checkGoal(sessionId: string, player: Player) {
        if (player.x === this.state.goalX && player.y === this.state.goalY) {
            player.score++;
            if (player.score >= WINS_NEEDED) {
                this.state.status = "MATCH_OVER";
                this.state.winnerId = sessionId;
            } else {
                this.state.status = "ROUND_OVER";
                this.state.timer = 3000; // 3 second delay
            }
        }
    }

    update(deltaTime: number) {
        if (this.state.status === "PLAYING") {
            this.state.timer += deltaTime;
            
            this.state.players.forEach((player) => {
                // AI Logic
                if (player.isBot && player.state === "normal") {
                    player.lastMoveTime += deltaTime;
                    if (player.lastMoveTime >= player.moveCooldown) {
                        player.lastMoveTime = 0;
                        this.aiTakeStep(player);
                    }
                }

                if (player.state === "teleport_out") {
                    player.stateTimer -= deltaTime;
                    if (player.stateTimer <= 0) {
                        player.x = player.targetX;
                        player.y = player.targetY;
                        player.state = "teleport_in";
                        player.stateTimer = 1000;
                    }
                } else if (player.state === "teleport_in") {
                    player.stateTimer -= deltaTime;
                    if (player.stateTimer <= 0) {
                        player.state = "normal";
                    }
                }
            });
        } else if (this.state.status === "ROUND_OVER") {
            this.state.timer -= deltaTime;
            if (this.state.timer <= 0) {
                this.initRound();
                this.state.status = "PLAYING";
            }
        }
    }

    aiTakeStep(player: Player) {
        // Simple focused AI: move towards goal
        const goalIndex = this.state.goalY * this.state.cols + this.state.goalX;
        // Simplified movement logic: find direction reducing distance to goal
        const moves = [
            {dx: 0, dy: -1}, {dx: 1, dy: 0}, {dx: 0, dy: 1}, {dx: -1, dy: 0}
        ];
        
        // Randomly pick a valid move
        const validMoves = moves.filter(m => this.canMove(player.x, player.y, m.dx, m.dy));
        if (validMoves.length > 0) {
            const move = validMoves[Math.floor(Math.random() * validMoves.length)];
            player.x += move.dx;
            player.y += move.dy;
            this.checkCollisions(player.id, player);
            this.checkPowerUps(player);
            this.checkGoal(player.id, player);
        }
    }
}
