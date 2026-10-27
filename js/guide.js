// First-run guide: teaches the one and only gesture by doing it.
//   1. "Step back until your hands are on screen" (waits for a real hand, shows live feedback)
//   2. One big "Touch me" bubble: reach out and touch it
//   3. "That's it" + where things are
// Works for touch-screen users too ("I'll tap the screen").

const $ = (id) => document.getElementById(id);

export function createGuide({ getHands, getTrackerState, popFx, onDone }) {
  let step = 0, seenSince = 0, timer = 0, touchMode = false;
  const root = $('guide');

  function show(n) {
    step = n;
    root.hidden = false;
    root.dataset.step = n;
    document.body.classList.add('guiding');
    $('touchMe').hidden = n !== 2;
    const title = $('guideTitle'), text = $('guideText'), alt = $('guideAlt');
    $('guideDots').innerHTML = [1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('');
    if (n === 1) {
      title.textContent = 'Step back so the camera can see your hands';
      text.textContent = 'Raise one or both hands, palms toward the screen. Rainbow lights appear on your fingertips when they are found.';
      alt.textContent = 'I will tap the screen instead';
      alt.hidden = false;
    } else if (n === 2) {
      title.textContent = touchMode ? 'Tap the glowing bubble' : 'Touch the glowing bubble with your hand';
      text.textContent = touchMode ? 'Bubbles are buttons. Tap them on the screen.' : 'Reach out, like touching a soap bubble in the mirror. No pinching, no waiting: just touch.';
      alt.textContent = 'Skip';
      alt.hidden = false;
    } else if (n === 3) {
      title.textContent = 'That is all there is to it!';
      text.textContent = 'Left bubbles choose what to play with. Right bubbles recolour your whole world. Touch Reset to go back to real colours.';
      alt.hidden = true;
      clearTimeout(timer);
      timer = setTimeout(finish, 6500);
    }
  }

  function finish() {
    clearTimeout(timer);
    step = 0;
    root.hidden = true;
    $('touchMe').hidden = true;
    document.body.classList.remove('guiding');
    onDone?.();
  }

  $('guideAlt').addEventListener('click', () => {
    if (step === 1) { touchMode = true; show(2); }
    else finish();
  });
  $('guideOk').addEventListener('click', finish);
  $('touchMe').addEventListener('click', (e) => {
    if (step !== 2) return;
    popFx($('touchMe'), e.isTrusted && e.clientX ? { x: e.clientX, y: e.clientY } : null);
    show(3);
  });

  return {
    get active() { return step > 0; },
    get step() { return step; },
    start() {
      touchMode = getTrackerState() === 'failed';
      show(touchMode ? 2 : 1);
    },
    finish,
    // called every frame
    tick(now) {
      if (step !== 1) return;
      const n = getHands().length;
      const live = $('guideLive');
      if (getTrackerState() === 'failed') { touchMode = true; show(2); return; }
      if (getTrackerState() !== 'ready') { live.textContent = 'Starting hand tracking…'; live.dataset.state = 'wait'; return; }
      if (n) {
        if (!seenSince) seenSince = now;
        live.textContent = n === 2 ? '✋ ✋  Both hands found!' : '✋  Hand found!';
        live.dataset.state = 'ok';
        if (now - seenSince > 900) show(2);
      } else {
        seenSince = 0;
        live.textContent = 'Looking for your hands…';
        live.dataset.state = 'wait';
      }
    },
  };
}
