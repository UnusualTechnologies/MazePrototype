import { Schema, Context, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Player extends Schema {
    @type("string") id: string;
    @type("number") x: number;
    @type("number") y: number;
    @type("string") color: string;
    @type("number") score: number = 0;
    @type("string") state: string = "normal"; // normal, teleport_out, teleport_in
    @type("number") stateTimer: number = 0;
    @type("boolean") isBot: boolean = false;
    @type("string") aiBehavior: string = "focused"; // focused, explorer, guesser
    @type("number") moveCooldown: number = 600;
    @type("number") lastMoveTime: number = 0;
    @type("number") targetX: number = 0;
    @type("number") targetY: number = 0;
    }

export class PowerUp extends Schema {
    @type("number") x: number;
    @type("number") y: number;
    @type("string") type: string; // opponents, self, rocket
}

export class Cell extends Schema {
    @type("boolean") top: boolean = true;
    @type("boolean") right: boolean = true;
    @type("boolean") bottom: boolean = true;
    @type("boolean") left: boolean = true;
}

export class GameState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
    @type([ PowerUp ]) powerUps = new ArraySchema<PowerUp>();
    @type("number") cols: number = 20;
    @type("number") rows: number = 20;
    @type("string") gridData: string = ""; // JSON stringified 2D array of booleans/numbers or similar
    
    @type("number") goalX: number = 10;
    @type("number") goalY: number = 10;

    @type("string") status: string = "LOBBY"; // LOBBY, PLAYING, ROUND_OVER, MATCH_OVER
    @type("string") roomCode: string = "";
    @type("number") timer: number = 0;
    @type("string") winnerId: string = "";
    
    // Grid stored as a flat array of numbers (4 bits for walls)
    @type(["number"]) grid = new ArraySchema<number>();

    @type("boolean") collisionsEnabled: boolean = true;
}
