# Derived Logic Tracking

Because the `@token-derby/shared` package is private and not published to public registries, the `token-derby-render` application maintains localized duplicates of server-side and client-side logic to guarantee visual parity.

This document tracks all code locations where equations, contracts, or constants are derived from the main `token-derby` repository.

---

## 1. Leveling & XP Formulas

* **Original File**: `token-derby` repository at `shared/src/levels.ts`
* **Local Implementations**:
  * [App.vue](file:///home/stu/projects/token-derby-render/src/App.vue#L100-L168) (Level and XP threshold math functions)
* **Visual Parity Logic**:
  * **XP to Level Equation**:
    $$xp(n) = 1.8 n^3 + 18 n^2 + 50 n - 19.8$$
  * **XP thresholds** for levels $1$ through $30$.
  * **XP Awards constants**:
    ```typescript
    const XP_AWARDS = {
      compete: 25,
      podium: 25,
      runner_up: 15,
      winner: 30,
      token_bonus_max: 15,
    };
    ```
  * **Podium XP calculation** (`xpForRaceFinish`), including rank bonuses and token-ratio calculations relative to the winner.

---

## 2. API Contract & TypeScript Models

* **Original File**: `token-derby` repository at `shared/src/types.ts`
* **Local Implementations**:
  * [RaceClient.ts](file:///home/stu/projects/token-derby-render/src/engine/RaceClient.ts#L4-L23) (`RaceView` and `HorseColors` interfaces)
* **Data Model Schema**:
  * Maps response payloads from `GET /api/races/{join_code}` containing live stats, coordinates, and event watermarks (`recent_events` for XP toast alerts).

---

## 3. Fallback Jersey/Saddle Palette

* **Original File**: `token-derby` repository at `shared/src/constants.ts` or frontend theme config
* **Local Implementations**:
  * [Horse.ts](file:///home/stu/projects/token-derby-render/src/engine/Horse.ts#L77) (Default saddle color array indexer)
  * [Horse.ts](file:///home/stu/projects/token-derby-render/src/engine/Horse.ts#L272) (Default hover ring colors)
* **Color Map Constants**:
  * Color indices map `0` through `5` to the hexadecimal palette:
    `[0xd84d38, 0x2d7dd2, 0xe7c948, 0x54a66d, 0x8b5bd6, 0xf47a30]`
  * Ensures fallback colors align with the lane representations on the scoreboard.

---

## Maintenance Guidelines

> [!WARNING]
> If changes are made to the game mechanics (such as increasing the `MAX_LEVEL`, shifting the XP curve, or altering podium XP modifiers) in the `token-derby` repo, those formulas **MUST** be manually updated in the files listed above to prevent UI desynchronization.
