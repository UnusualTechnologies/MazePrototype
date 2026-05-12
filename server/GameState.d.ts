import { Schema, MapSchema } from "@colyseus/schema";
export declare class Player extends Schema {
    id: string;
    x: number;
    y: number;
    score: number;
    color: string;
}
export declare class GameState extends Schema {
    players: MapSchema<Player, string>;
    timer: number;
    mazeData: string[];
}
//# sourceMappingURL=GameState.d.ts.map