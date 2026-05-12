# Neon Bug Race - Project Context

## Overview
A high-speed multiplayer maze racing game using Colyseus for networking and Canvas for rendering.

## Versioning System
We use a strict `x.y.z` versioning system tracked in `version.json` and displayed in `index.html`.

### Rules
1. **Patch Increment (`z`):** Every code change or bug fix MUST increment the `patch` version.
   - Run: `.\build.ps1 -Type patch`
2. **Minor Increment (`y`):** Every "Build" or major feature release MUST increment the `minor` version and reset the `patch` to 0.
   - Run: `.\build.ps1 -Type minor`
3. **Display:** The version is shown in the bottom right of the UI via the `<div id="version-number">` in `index.html`.

## Tech Stack
- **Frontend:** Vanilla JavaScript, HTML5 Canvas, CSS.
- **Backend:** Colyseus (Node.js/TypeScript).
- **Communication:** WebSockets via Colyseus SDK.

## Key Files
- `index.html`: Main game logic, rendering, and UI.
- `server/GameRoom.ts`: Server-side game state and logic.
- `build.ps1`: Version management script.
- `version.json`: Current version source of truth.

## Development Workflow
- When fixing bugs or adding small features, run the build script with `-Type patch`.
- Before a major push or "build" event, run with `-Type minor`.
- Always verify that `index.html` reflects the updated version string.
