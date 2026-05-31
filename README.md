# Token Derby Render

A browser-based 3D race visualisation prototype for Token Derby, built with Vue and Three.js.

The scene renders a stylised London park horse race with a stadium track, animated runners, dynamic weather, time-of-day lighting, a grandstand crowd, floodlights, skyline details, and trackside interaction.

## Features

- Stadium-style race track with inside-rail bunching and outside overtaking behaviour.
- Animated horses and jockeys with dust kick-up and selectable runner info.
- Grandstand with seating, faux crowd, scoreboard, roof lights, and entry stairs.
- London park environment with paths, trees, benches, fences, houses, skyline landmarks, and floodlights.
- Weather presets for light cloud, very cloudy, rain, and storm.
- Time-of-day control with adaptive lighting.
- Performance-oriented rendering with instancing, reduced background detail, adaptive pixel ratio, and optional diagnostics.

## Getting Started

Install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm run dev
```

Build for production:

```sh
npm run build
```

Preview the production build locally:

```sh
npm run preview
```

## Controls

- `Left` / `Right`: move the camera around the track rail.
- `Up` / `Down`: raise or lower the camera.
- Drag in the viewport: free-look camera control.
- Click a horse: show runner details.
- HUD controls: pause/run, reset, weather, and time of day.

## Diagnostics

Performance diagnostics are hidden by default. Add `?debug=perf` to the local URL to show FPS, draw calls, triangle count, object count, light count, geometry count, and texture count.

Example:

```txt
http://localhost:5173/?debug=perf
```

## Tech Stack

- Vue 3
- Three.js
- Vite
- TypeScript

## Shared & Derived Logic

Because the `@token-derby/shared` library is a private package, this repo hosts local copies of critical server-side leveling, color indexing, and API data models. See [DERIVED_LOGIC.md](file:///home/stu/projects/token-derby-render/DERIVED_LOGIC.md) for details on files that must be synchronized.

## License

MIT

