import { Room } from "colyseus";
import { type Client } from "@colyseus/core";
import { GameState, Player, Cell, PowerUp, Slot } from "./GameState.ts";

export class GameRoom extends Room<GameState> {
    maxClients = 8;
    cols = 20;
    rows = 20;
    collisions = true;
    spawnOptions: any = {};

    // BFS distance map from goal — flat array indexed [x * rows + y]
    distanceMap: number[] = [];
    // Per-AI session state (not broadcast)
    explorerLastPos = new Map<string, { x: number; y: number }>();
    guesserData = new Map<string, { target: { x: number; y: number }; distMap: number[] }>();
    // Freeze simulation while waiting for round reset
    roundOver: boolean = false;

    // --- Lifecycle ---

    onCreate(options: any) {
        // Use an unambiguous uppercase-only room ID
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let customId = '';
        for (let i = 0; i < 9; i++) customId += chars.charAt(Math.floor(Math.random() * chars.length));
        this.roomId = customId;

        this.cols = Number(options.cols) || 20;
        this.rows = Number(options.rows) || 20;
        this.collisions = options.collisions !== false; // default true

        const state = new GameState();
        state.cols = this.cols;
        state.rows = this.rows;
        state.goalX = Math.floor(this.cols / 2);
        state.goalY = Math.floor(this.rows / 2);

        const defaultColors = [
            '#ff0055', '#ff8800', '#ffee00', '#00ff22',
            '#00ffff', '#4466ff', '#aa00ff', '#ff00ff'
        ];

        const aiSpeedMs: Record<string, number> = {
            easy: 1000, intermediate: 600, hard: 300, scaling: 600
        };

        for (let i = 0; i < 8; i++) {
            const slot = new Slot();
            const config = options.slots ? options.slots[i] : null;

            if (config) {
                slot.mode = config.mode || "inactive";
                slot.id = config.id || `Player ${i + 1}`;
                slot.color = config.color || defaultColors[i];
                slot.aiBehavior = config.aiBehavior || "random";
                slot.controlScheme = config.controlScheme || "WASD";

                const speedKey = config.aiSpeed || "intermediate";
                if (speedKey === "custom") {
                    slot.aiSpeed = Math.max(100, Math.min(1000, Number(config.aiCustomSpeed) || 600));
                } else if (speedKey === "random") {
                    slot.aiSpeed = Math.floor(Math.random() * 900 + 100);
                } else {
                    slot.aiSpeed = aiSpeedMs[speedKey] ?? 600;
                }
            } else {
                if (i === 0) slot.mode = "local";
                else if (i < 4) slot.mode = "ai_online";
                else slot.mode = "inactive";
                slot.id = `Player ${i + 1}`;
                slot.color = defaultColors[i];
            }
            state.slots.push(slot);

            if (slot.mode !== "inactive") {
                const player = new Player();
                player.id = slot.id;
                player.color = slot.color;
                player.isAI = true;
                player.slotIndex = i;
                const startX = (i % 2 === 0) ? 0 : state.cols - 1;
                const startY = (i < 2 || i > 5) ? 0 : state.rows - 1;
                player.x = startX;
                player.y = startY;
                state.players.set(`ai_${i}`, player);
            }
        }

        this.spawnOptions = options;
        this.setState(state);
        this.generateMaze();
        this.spawnPowerUps(options);

        // BFS distance map must be computed after maze is generated
        this.distanceMap = this.computeDistanceMap(state.goalX, state.goalY);

        // Pre-compute guesser targets for any guesser AI slots
        state.players.forEach((player, sid) => {
            if (player.isAI) this.initAIState(sid, player);
        });

        if (options.isPrivate) this.setPrivate(true);

        this.setSimulationInterval((dt) => {
            if (this.roundOver) return; // Freeze everything during round-over countdown
            this.state.timer += dt / 1000;
            this.state.players.forEach((player, sessionId) => {
                if (player.isAI) {
                    if (!player['aiCooldown']) player['aiCooldown'] = 0;
                    player['aiCooldown'] += dt;
                    const slotSpeed = this.state.slots[player.slotIndex]?.aiSpeed ?? 600;
                    if (player['aiCooldown'] >= slotSpeed) {
                        player['aiCooldown'] = 0;
                        this.moveAI(sessionId, player);
                    }
                }
            });
        });

        this.onMessage("move", (client, message) => {
            if (this.roundOver) return; // Reject moves during round-over countdown
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isAI) return;
            player.x = message.x;
            player.y = message.y;
            this.checkCollisions(player, client.sessionId);
        });

        console.log(`Room created: ${this.roomId}`);
    }

    onJoin(client: Client, options: any) {
        console.log(`Client ${client.sessionId} joining...`);

        const isHost = this.clients.length === 1;
        let assignedSlotIndex = -1;

        if (isHost) {
            assignedSlotIndex = this.state.slots.findIndex(s => s.mode === "local" || s.mode === "ai_online");
        } else {
            assignedSlotIndex = this.state.slots.findIndex(s => s.mode === "ai_online" && s.sessionId === "");
        }

        if (assignedSlotIndex === -1) {
            console.log(`No available slots for client ${client.sessionId}`);
            throw new Error("ROOM_FULL");
        }

        const slot = this.state.slots[assignedSlotIndex];
        slot.sessionId = client.sessionId;

        // Take over the existing AI player at this slot (preserving position and score)
        let existingPlayer: Player | null = null;
        let existingId: string | null = null;
        this.state.players.forEach((p, id) => {
            if (p.slotIndex === assignedSlotIndex) {
                existingPlayer = p;
                existingId = id;
            }
        });

        if (existingPlayer && existingId) {
            this.state.players.delete(existingId);
            this.explorerLastPos.delete(existingId);
            this.guesserData.delete(existingId);
            existingPlayer.isAI = false;
            this.state.players.set(client.sessionId, existingPlayer);
        } else {
            // No AI placeholder found — create fresh at start position
            const player = new Player();
            player.id = slot.id;
            player.color = slot.color;
            player.isAI = false;
            player.slotIndex = assignedSlotIndex;
            player.x = (assignedSlotIndex % 2 === 0) ? 0 : this.cols - 1;
            player.y = (assignedSlotIndex < 2 || assignedSlotIndex > 5) ? 0 : this.rows - 1;
            this.state.players.set(client.sessionId, player);
        }
        console.log(`Client ${client.sessionId} assigned to slot ${assignedSlotIndex}`);
    }

    onLeave(client: Client, consented: boolean) {
        const player = this.state.players.get(client.sessionId);
        if (player) {
            const slotIndex = player.slotIndex;
            const slot = this.state.slots[slotIndex];
            if (slot.mode === "ai_online" || slot.mode === "local") {
                const aiId = `ai_${slotIndex}`;
                player.isAI = true;
                slot.sessionId = "";
                this.state.players.delete(client.sessionId);
                this.state.players.set(aiId, player);
                this.initAIState(aiId, player);
                console.log(`Player ${client.sessionId} left. AI taking over slot ${slotIndex}.`);
            }
        }
    }

    // --- AI Navigation ---

    /** BFS from (goalX, goalY) through the maze; returns flat [x*rows+y] distance array. */
    computeDistanceMap(goalX: number, goalY: number): number[] {
        const map = new Array(this.cols * this.rows).fill(Infinity);
        map[goalX * this.rows + goalY] = 0;
        const queue: { x: number; y: number }[] = [{ x: goalX, y: goalY }];
        const dirs = [
            { dx: 0, dy: -1, wall: 0 },
            { dx: 1,  dy: 0, wall: 1 },
            { dx: 0,  dy: 1, wall: 2 },
            { dx: -1, dy: 0, wall: 3 },
        ];
        while (queue.length > 0) {
            const curr = queue.shift()!;
            const cell = this.state.grid[curr.x * this.rows + curr.y];
            const currDist = map[curr.x * this.rows + curr.y];
            for (const d of dirs) {
                const nx = curr.x + d.dx, ny = curr.y + d.dy;
                if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows && !cell.walls[d.wall]) {
                    const ni = nx * this.rows + ny;
                    if (map[ni] === Infinity) {
                        map[ni] = currDist + 1;
                        queue.push({ x: nx, y: ny });
                    }
                }
            }
        }
        return map;
    }

    initAIState(sessionId: string, player: Player) {
        const behavior = this.state.slots[player.slotIndex]?.aiBehavior ?? "random";
        if (behavior === "explorer") {
            this.explorerLastPos.set(sessionId, { x: -1, y: -1 });
        } else if (behavior === "guesser") {
            // Pick a random target that isn't the goal
            let rx: number, ry: number;
            do {
                rx = Math.floor(Math.random() * this.cols);
                ry = Math.floor(Math.random() * this.rows);
            } while (rx === this.state.goalX && ry === this.state.goalY);
            this.guesserData.set(sessionId, {
                target: { x: rx, y: ry },
                distMap: this.computeDistanceMap(rx, ry),
            });
        }
    }

    moveAI(sessionId: string, player: Player) {
        const slot = this.state.slots[player.slotIndex];
        let behavior = slot?.aiBehavior ?? "random";

        const cell = this.state.grid[player.x * this.rows + player.y];
        const dirs = [
            { dx: 0, dy: -1, wall: 0 },
            { dx: 1,  dy: 0, wall: 1 },
            { dx: 0,  dy: 1, wall: 2 },
            { dx: -1, dy: 0, wall: 3 },
        ];

        // Collect open neighbours
        const open = dirs
            .filter(d => {
                const nx = player.x + d.dx, ny = player.y + d.dy;
                return nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows && !cell.walls[d.wall];
            })
            .map(d => ({ x: player.x + d.dx, y: player.y + d.dy }));

        if (open.length === 0) return;

        let move: { x: number; y: number } | null = null;

        if (behavior === "explorer") {
            const last = this.explorerLastPos.get(sessionId) ?? { x: -1, y: -1 };

            // If no one else is closer to the goal, act focused
            const myDist = this.distanceMap[player.x * this.rows + player.y];
            let minOtherDist = Infinity;
            this.state.players.forEach((other, sid) => {
                if (sid !== sessionId) {
                    const d = this.distanceMap[other.x * this.rows + other.y];
                    if (d < minOtherDist) minOtherDist = d;
                }
            });

            if (myDist <= minOtherDist) {
                // Act focused
                for (const n of open) {
                    const d = this.distanceMap[n.x * this.rows + n.y];
                    if (d < myDist && (!move || d < this.distanceMap[move.x * this.rows + move.y])) move = n;
                }
            }

            if (!move) {
                // Prefer not backtracking
                const forward = open.filter(n => !(n.x === last.x && n.y === last.y));
                move = (forward.length > 0 ? forward : open)[Math.floor(Math.random() * (forward.length > 0 ? forward.length : open.length))];
            }

            this.explorerLastPos.set(sessionId, { x: player.x, y: player.y });

        } else if (behavior === "guesser") {
            const gd = this.guesserData.get(sessionId);
            if (gd && (player.x !== gd.target.x || player.y !== gd.target.y)) {
                // Navigate to guess target
                const currDist = gd.distMap[player.x * this.rows + player.y];
                for (const n of open) {
                    const d = gd.distMap[n.x * this.rows + n.y];
                    if (d < currDist && (!move || d < gd.distMap[move.x * this.rows + move.y])) move = n;
                }
            }
            // If at target or no route, fall through to focused
            if (!move) behavior = "focused";
        }

        if (behavior === "focused" || (!move && behavior !== "explorer")) {
            // Greedy: step to open neighbour with smallest BFS distance to goal
            const currDist = this.distanceMap[player.x * this.rows + player.y];
            for (const n of open) {
                const d = this.distanceMap[n.x * this.rows + n.y];
                if (d < currDist && (!move || d < this.distanceMap[move.x * this.rows + move.y])) move = n;
            }
        }

        if (behavior === "random" && !move) {
            move = open[Math.floor(Math.random() * open.length)];
        }

        // Final fallback: random (handles dead-ends with no improving move)
        if (!move) move = open[Math.floor(Math.random() * open.length)];

        player.x = move.x;
        player.y = move.y;
        this.checkCollisions(player, sessionId);
    }

    // --- Maze & Powerups ---

    generateMaze() {
        for (let x = 0; x < this.cols; x++) {
            for (let y = 0; y < this.rows; y++) {
                const cell = new Cell();
                cell.walls[0] = cell.walls[1] = cell.walls[2] = cell.walls[3] = true;
                this.state.grid.push(cell);
            }
        }

        const stack: { x: number; y: number }[] = [];
        const visited = new Set<string>();
        stack.push({ x: 0, y: 0 });
        visited.add('0,0');

        while (stack.length > 0) {
            const curr = stack[stack.length - 1];
            const neighbors: { x: number; y: number; wall: number; oppWall: number }[] = [];
            const dirs = [
                { x: 0, y: -1, wall: 0, oppWall: 2 },
                { x: 1,  y: 0, wall: 1, oppWall: 3 },
                { x: 0,  y: 1, wall: 2, oppWall: 0 },
                { x: -1, y: 0, wall: 3, oppWall: 1 },
            ];
            for (const d of dirs) {
                const nx = curr.x + d.x, ny = curr.y + d.y;
                if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows && !visited.has(`${nx},${ny}`)) {
                    neighbors.push({ x: nx, y: ny, wall: d.wall, oppWall: d.oppWall });
                }
            }
            if (neighbors.length > 0) {
                const next = neighbors[Math.floor(Math.random() * neighbors.length)];
                this.state.grid[curr.x * this.rows + curr.y].walls[next.wall] = false;
                this.state.grid[next.x * this.rows + next.y].walls[next.oppWall] = false;
                visited.add(`${next.x},${next.y}`);
                stack.push({ x: next.x, y: next.y });
            } else {
                stack.pop();
            }
        }
    }

    spawnPowerUps(options: any = {}) {
        this.state.powerUps.clear();
        const puOpp    = options.puOpp    !== undefined ? Number(options.puOpp)    : 10;
        const puSelf   = options.puSelf   !== undefined ? Number(options.puSelf)   : 10;
        const puRocket = options.puRocket !== undefined ? Number(options.puRocket) : 0;

        const spawn = (count: number, type: string) => {
            if (isNaN(count) || count <= 0) return;
            for (let i = 0; i < count; i++) {
                const pu = new PowerUp();
                pu.x = Math.floor(Math.random() * this.cols);
                pu.y = Math.floor(Math.random() * this.rows);
                pu.type = type;
                this.state.powerUps.push(pu);
            }
        };

        spawn(puOpp, "opponents");
        spawn(puSelf, "self");
        spawn(puRocket, "rocket");
    }

    // --- Collision & Teleport ---

    checkCollisions(player: Player, sessionId: string) {
        // Power-up pickup (always active)
        const puIndex = this.state.powerUps.findIndex(pu => pu.x === player.x && pu.y === player.y);
        if (puIndex !== -1) {
            const pu = this.state.powerUps[puIndex];
            this.state.powerUps.splice(puIndex, 1);
            if (pu.type === "opponents") {
                this.state.players.forEach((p, sid) => {
                    if (sid !== sessionId) this.teleportPlayer(p);
                });
            } else if (pu.type === "self") {
                this.teleportPlayer(player);
            }
        }

        // Player-player collisions (respects lobby setting)
        if (this.collisions) {
            this.state.players.forEach((other, sid) => {
                if (sid !== sessionId && other.x === player.x && other.y === player.y) {
                    this.teleportPlayer(player);
                    this.teleportPlayer(other);
                }
            });
        }

        // Goal check
        if (player.x === this.state.goalX && player.y === this.state.goalY) {
            this.roundOver = true; // Freeze the game immediately
            player.score++;
            const isMatchWon = player.score >= 3;
            this.broadcast("round_won", {
                winnerId: player.id,
                winnerColor: player.color,
                winnerScore: player.score,
                isMatchWon,
            });
            // Reset round after 3 s (match over skips reset — clients navigate away)
            if (!isMatchWon) {
                this.clock.setTimeout(() => {
                    this.broadcast("round_reset");
                    this.resetRound();
                }, 3000);
            }
        }
    }

    resetRound() {
        this.roundOver = false; // Unfreeze before applying new state
        // New maze
        this.state.grid.clear();
        this.generateMaze();
        this.distanceMap = this.computeDistanceMap(this.state.goalX, this.state.goalY);

        // Reset all player positions to starting corners
        this.state.players.forEach((player, sessionId) => {
            const i = player.slotIndex;
            player.x = (i % 2 === 0) ? 0 : this.cols - 1;
            player.y = (i < 2 || i > 5) ? 0 : this.rows - 1;
            player['aiCooldown'] = 0;
            // Re-init guesser/explorer state for AI
            if (player.isAI) this.initAIState(sessionId, player);
        });

        // Fresh power-ups using original lobby settings
        this.spawnPowerUps(this.spawnOptions);
        this.state.timer = 0;
    }

    teleportPlayer(player: Player) {
        let x: number, y: number;
        do {
            x = Math.floor(Math.random() * this.cols);
            y = Math.floor(Math.random() * this.rows);
        } while (x === this.state.goalX && y === this.state.goalY);
        player.x = x;
        player.y = y;
    }

    getDistance(x: number, y: number) {
        return this.distanceMap[x * this.rows + y] ?? Infinity;
    }
}
