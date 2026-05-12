import { Schema, ArraySchema, MapSchema, type } from "@colyseus/schema";
export class Player extends Schema {
    @type("string")
    id = "";
    @type("number")
    x = 0;
    @type("number")
    y = 0;
    @type("number")
    score = 0;
    @type("string")
    color = "#ffffff";
}
export class GameState extends Schema {
    @type({ map: Player })
    players = new MapSchema();
    @type("number")
    timer = 0;
    @type(["string"])
    mazeData = []; // Simple wall representation
}
//# sourceMappingURL=GameState.js.map