import { Schema, ArraySchema, MapSchema, type } from "@colyseus/schema";

export class Cell extends Schema {
    @type([ "boolean" ]) walls = new ArraySchema<boolean>(true, true, true, true);
}

export class Player extends Schema {
    @type("string") id: string = "";
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("number") score: number = 0;
    @type("string") color: string = "#ffffff";
}

export class PowerUp extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("string") type: string = ""; // "opponents", "self", "rocket"
}

export class GameState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
    @type("number") timer: number = 0;
    @type([ Cell ]) grid = new ArraySchema<Cell>();
    @type("number") cols: number = 20;
    @type("number") rows: number = 20;
    @type("number") goalX: number = 10;
    @type("number") goalY: number = 10;
    @type([ PowerUp ]) powerUps = new ArraySchema<PowerUp>();
}
