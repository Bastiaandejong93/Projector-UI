# Projector UI

Local fullscreen projector-home prototype for Luna.

## Run locally

```bash
npm install
npm run dev
```

The prototype supports keyboard navigation and the browser Gamepad API:

- Arrow keys / D-pad / left stick: navigate
- Enter / Space / A: select
- Escape / Backspace / B: back

The Android projector adapter, real app launching, and stock-launcher handoff are intentionally not connected yet. The UI includes a safe demo confirmation for “Exit to stock UI” until the projector is validated through ADB.

## Checks

```bash
npm run build
npm test
```
