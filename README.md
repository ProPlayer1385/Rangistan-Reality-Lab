# RANGISTAN · Reality Lab

An AR colour lab from the world of **Rangistan**. Step in front of the camera and **touch the floating colour bubbles** with your hands. Your face, your clothes, the walls: the whole world changes colour.

There is only one thing to learn: **touch a bubble**. No pinching, no holding still, no menus to dig through. On phones and tablets you can simply tap the bubbles on the screen.

Runs in the browser, works on laptops, phones and tablets, needs no installation and no server code. The camera image never leaves the device.

---

## How to play

1. Click **Enter the mirror** and allow the camera.
2. A short guide appears:
   * **Step back** until the camera sees your hands. Rainbow lights appear on your fingertips when they are found.
   * **Touch the glowing "Touch me" bubble** with your hand, like touching a soap bubble in the mirror.
   * That's it.
3. The bubbles on the **left** choose what to play with. The bubbles on the **right** change the colours.

| Left bubble | What the right bubbles do |
|---|---|
| **Filters** | Instant looks for the whole world: Vivid, Rangistan, Golden, Arctic, Noir, Sepia, Neon, Pop Art, X-Ray, Dream, Original |
| **Light Mix** | Switch red, green and blue light on and off and see additive mixing: red + green = yellow, all three = white |
| **Harmony** | Touch a colour and the world is painted with colours that go with it. The scheme bubble cycles complementary, analogous, triadic and split-complementary |
| **Adjust** | Brighter, darker, more or less colour, warmer, cooler, more or less contrast, shift hue, grayscale |
| **Reset** | Back to the real colours |

A small card at the bottom explains every change in plain words ("Red + Green = Yellow", "Grayscale with a warm tone").

The dock at the bottom has: **?** replay the guide · **sound** on/off · **camera switch** (when there is a second camera) · **full screen** · **hide** the bubbles (touch the small "Show" bubble to bring them back).

Keyboard (optional): `1` to `4` modes, `R` reset, `H` hide, `F` full screen, `Esc` close the guide.

### Tips for a smooth demo
* **Light:** face a window or lamp. The app warns you if the room is too dark.
* **Distance:** about 1 to 2 m from a laptop camera, so your raised hands are in the picture. The app reminds you if it can't see your hands.
* **Point with one finger** for precision. An open palm also works.
* Close Zoom, Teams, Meet and the Camera app (only one app can use the camera).

---

## Run it on your computer

Inside the `rangistan-reality-lab` folder:

```
python -m http.server 8000
```

(Windows: `py -m http.server 8000` if `python` isn't found.) Then open **http://localhost:8000** in Chrome or Edge. After updating from an older version, press **Ctrl + Shift + R** once.

Do not double-click `index.html`: browsers block cameras on `file://` pages (the app tells you if you do).

---

## Put it online (free, https)

The folder is a ready-made static website. Upload **the whole folder**, including `vendor/`, `models/` and `fonts/` (about 28 MB). There is no build step.

### Vercel
* **From your computer:** inside the folder run `npx vercel`, accept the defaults (Framework: **Other**, no build command, output directory `.`), then `npx vercel --prod`.
* **From GitHub:** push the folder to a repository, go to https://vercel.com/new, import it, Framework Preset **Other**, Deploy.

### Netlify
* **Fastest:** open https://app.netlify.com/drop and drag the folder onto the page.
* **From GitHub:** Add new site > Import from Git. The included `netlify.toml` already sets everything.

Share the `https://…` link. Every visitor allows their own camera; on phones, use Safari (iPhone/iPad) or Chrome (Android). Links opened inside Instagram/Facebook/LinkedIn often can't use the camera; the app tells people to open the link in their browser.

---

## Phones and tablets
* Front camera, mirrored, by default. The camera-switch button appears when there is a rear camera; the rear view is not mirrored.
* Portrait and landscape both work; bubbles resize to fit and stay at the screen edges.
* **Tap** bubbles on the screen, or prop the phone up and use your hands.
* iPhones don't allow web pages to go full screen. Use Share > **Add to Home Screen** for an app-like full screen.
* If a call or app switch interrupts the camera, a **Resume** card appears; coming back to the page resumes automatically when possible.

---

## Why it is accurate and fast

* **The camera is the cursor.** A bubble fires when one of your fingertips, exactly where it is drawn in the mirror, enters it. The same calculation draws the camera and checks touches, so there is nothing to calibrate and nothing to drift.
* **No accidental taps:**
  * Only stretched-out fingers count, so curled fingers below a pointing finger don't brush other bubbles.
  * A fingertip must be inside for two camera frames in a row.
  * Each bubble fires once until you move away.
  * A hand that appears on top of a bubble, or a bubble that appears under a hand, does not fire.
  * Each hand taps one bubble at a time.
* **Fast:** hand tracking (Google MediaPipe) runs in a background worker on a reduced 640-pixel copy of the frame, using the graphics chip when available. The bubbles and camera stay smooth even on slower laptops. If a browser can't run the worker, the app falls back automatically.
* Everything (tracking library, model, fonts) is bundled, so no internet is needed once loaded.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Camera permission was blocked" | Click the camera/lock icon left of the address bar > Allow > Try again. Windows: Settings > Privacy & security > Camera. iPhone: Settings > Safari > Camera. |
| "The camera is busy" | Another app is using it. Close Zoom/Teams/Camera app/other tabs. |
| No rainbow lights on my fingers | More light; step back so your hands are fully in the picture; palms toward the screen. |
| A bubble doesn't react | Touch it with a straight finger and move your hand right into it; to tap the same bubble again, pull back first. |
| Status says "Tap mode" | Hand tracking isn't supported on this device/browser; tap the bubbles on the screen. |
| "The app scripts did not start" | Start the server inside the project folder, then Ctrl + Shift + R. |

---

## Project files

```
index.html            Page, boot checks, guide
netlify.toml          Netlify settings (optional)
css/style.css         Look: glossy bubbles, layouts for every screen
js/main.js            Start-up, camera, frame loop, helpers (darkness / where are my hands)
js/ui.js              Bubble rails, modes, info card
js/touch.js           Touch-the-bubble detection (fingertips vs bubbles)
js/tracker.js         Hand tracking in a worker (with fallback)
js/hand-worker.js     The worker running MediaPipe
js/guide.js           Three-step first-run guide
js/fx.js              Fingertip glows, bubble pops, sound
js/renderer.js        WebGL colour processing of the whole camera frame
js/mapping.js         The one camera-to-screen mapping
js/camera.js          Camera start, switching, friendly errors
js/state.js           Colours, filters, smooth transitions
js/color.js           Colour maths
vendor/, models/      MediaPipe library and hand model (Apache 2.0)
fonts/                Syne, Space Grotesk (SIL Open Font License)
```
