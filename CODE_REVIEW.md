# Code Review Report

## Findings

1. **High: `DerbyScene` is doing too much.**

   [`src/engine/DerbyScene.ts`](src/engine/DerbyScene.ts) is 2,600 lines and owns renderer lifecycle, race syncing, horse state, camera modes, selection, weather, lighting, dust, track geometry, park generation, skyline setup, performance UI, and cleanup.

   This makes geometry changes risky because unrelated systems share state in one class. Split this into scene/runtime orchestration plus focused builders/controllers:

   - `TrackBuilder` or `TrackLayout`
   - `ParkEnvironment`
   - `CameraController`
   - `RaceSyncController`
   - `EffectsController`
   - `SceneDisposer`

2. **High: `App.vue` has become an application controller, not just a view.**

   [`src/App.vue`](src/App.vue) is 963 lines and mixes UI state, API polling, achievement logic, XP math, confetti animation, podium Three.js previews, and scene callbacks.

   Extract likely modules:

   - `useRacePolling`
   - `useAchievements`
   - `leveling.ts`
   - `useConfetti`
   - `PodiumPreview.vue`

3. **Medium: production API client contains demo race simulation.**

   [`src/engine/RaceClient.ts`](src/engine/RaceClient.ts) hard-codes the production API base and contains the full mock race generator.

   That mixes real transport, configuration, and demo data in one public-facing class. Better shape:

   - `RaceClient` only fetches data.
   - API base comes from env/config.
   - Demo mode lives in a separate `DemoRaceClient` or fixture generator.

4. **Medium: procedural textures are nondeterministic and may create excess GPU texture objects.**

   [`src/engine/Textures.ts`](src/engine/Textures.ts) uses `Math.random()` to create textures, so visuals change every reload. `getSurfaceTexture()` clones the cached texture for every requested repeat, meaning each material gets a new texture object.

   Prefer seeded noise and cache by `kind + repeatX + repeatY`, or move to small committed texture assets.

5. **Medium: cleanup code is too reflective and swallows errors.**

   [`src/engine/DerbyScene.ts`](src/engine/DerbyScene.ts) catches and ignores disposal failures, then traverses every object as `any` and iterates every material property looking for textures.

   Prefer typed disposal helpers for `Mesh`, `Material`, and `Texture`, and log disposal failures in development.

6. **Medium: type safety has avoidable holes.**

   Current examples include:

   - `setPodiumCanvasRef(el: any, ...)`
   - `catch (err: any)`
   - `catch (error: any)`
   - `private animatedMaterials: any[]`
   - `scene.traverse((object: any) => ...)`

   These should mostly be `unknown`, `HTMLCanvasElement | null`, `THREE.Material[]`, or narrowed Three.js types.

7. **Low: large procedural builders need named sub-builders.**

   [`src/engine/Grandstand.ts`](src/engine/Grandstand.ts) is healthier because it merges geometry, but the single `build()` method still creates structure, seats, stairs, rails, roof, scoreboard, crowd, and lights.

   Split out:

   - `buildStructure`
   - `buildSeating`
   - `buildStairs`
   - `buildRoof`
   - `buildScoreboard`
   - `buildLighting`

8. **Low: styles are large enough to benefit from feature grouping.**

   [`src/style.css`](src/style.css) is 1,175 lines. Before public GitHub use, split or clearly section it by viewport shell, controls, race HUD, overlays, podium, toasts, and responsive rules.

## Notes

The skyline horizon code has already moved away from the worst draw-call pattern by flushing geometry buckets into merged meshes. Keep following that pattern.

No critical correctness bug jumped out from this pass. The main risk is maintainability: too many systems are concentrated in `DerbyScene` and `App.vue`, which will slow down future geometry, camera, and race UI changes.
