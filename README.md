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

## Navigation

- Up from the app row focuses the left navigation trigger.
- Left/right switches between the two top triggers; Down returns to the same app.
- Select opens a menu. In the left navigation, left/right traverses Search, Home, Shop, Discover and Apps. Right after Apps reaches the system trigger.
- In the system drawer, up/down reaches every item, including Exit to stock UI.
- Exit opens a confirmation with No selected. Left/right chooses No/Yes; Back cancels and returns to the exit button.
- Tab follows normal browser navigation outside dialogs. Inside the system drawer or confirmation it stays within the open dialog; Escape leaves it.
- Held select/back is ignored. Held directions repeat at a bounded rate.

Keyboard, gamepad and pointer use `src/focus-controller.ts`. Tests import the compiled production controller; they do not duplicate its navigation rules. Native DOM focus is reconciled with the controller, including Tab and pointer changes.

Background animation, the gamepad polling loop and the clock timer pause when the document is hidden. Preferences are optional: unavailable browser storage does not prevent startup. The quiet background mode disables tint/lightning animations; reduced motion also disables confirmation and logo-scale motion.

The Android projector adapter, real app launching, and stock-launcher handoff are intentionally not connected yet. The UI includes a safe demo confirmation for “Exit to stock UI” until the projector is validated through ADB.

## Checks

```bash
npm run build
npm test
```

Verified on desktop: production build, nine controller/input regression tests, and browser keyboard routes through both menus, exit cancellation/confirmation and Tab focus. A physical controller and the projector have not been validated in this pass.

## Next: projector integration

First identify the actual model, firmware, installed apps and stock-launcher activity through ADB. Keep system changes separate from the browser prototype. The stock-exit route must target the verified original launcher explicitly: a generic HOME intent could return to this app once it becomes the default home.

App launching, stock exit and boot-to-home are still demo-only. Test the return route on hardware before changing the default launcher or disabling any existing packages.
