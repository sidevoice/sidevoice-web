import { test, expect } from "@playwright/test";

test("a reply cut off keeps its mark over the soft card's shadow, in both themes", async ({ page }) => {
  await page.goto("/voice/");
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.className = "call-layout";
    host.innerHTML = `<div class="chat-bubble" data-role="assistant" data-position="only">Complete</div>
      <div class="chat-bubble" data-role="assistant" data-position="only" data-interrupted="true">Interrupted</div>
      <div class="chat-bubble" data-role="user" data-position="only">Person</div>`;
    document.body.append(host);
  });
  for (const theme of ["light", "dark"]) {
    const paints = await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
      const [complete, interrupted] = document.querySelectorAll(".call-layout .chat-bubble");
      return { complete: getComputedStyle(complete).boxShadow, interrupted: getComputedStyle(interrupted).boxShadow };
    }, theme);
    expect(paints.complete, theme).not.toBe("none");
    expect(paints.interrupted, theme).not.toBe(paints.complete);
    expect(paints.interrupted, theme).toContain("inset");
  }
});

test("transcribing bars keep 3:1 contrast at the pulse minimum and with reduced motion", async ({ page }) => {
  await page.goto("/voice/");
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.className = "call-layout";
    host.innerHTML = `<div class="person-bubble">
      <span class="voice-wave" data-phase="transcribing"><canvas></canvas></span>
      <span class="voice-bars" data-phase="transcribing"><i></i></span></div>`;
    document.body.append(host);
  });
  const paint = async (reduced) => {
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    return page.evaluate((reduced) => {
      const canvas = document.querySelector(".person-bubble .voice-wave canvas");
      const bar = document.querySelector(".person-bubble .voice-bars i");
      const wave = canvas.parentElement, bars = bar.parentElement;
      if (canvas.getAnimations().length) {
        const animation = canvas.getAnimations()[0];
        animation.currentTime = 950;
        animation.pause();
      }
      const colors = (element, surface) => ({
        ink: getComputedStyle(element).color,
        opacity: Number(getComputedStyle(element).opacity),
        surface: getComputedStyle(surface).backgroundColor,
      });
      return reduced ? colors(bar, bars) : colors(canvas, wave);
    }, reduced);
  };
  const ratio = ({ ink, opacity, surface }) => {
    const channels = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
      .map((v) => value.startsWith("color(srgb ") ? v * 255 : v);
    const a = channels(ink), b = channels(surface);
    const mixed = a.map((v, i) => v * opacity + b[i] * (1 - opacity));
    const luminance = (rgb) => rgb.map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const [high, low] = [luminance(mixed), luminance(b)].sort((x, y) => y - x);
    return (high + .05) / (low + .05);
  };
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, theme);
    // The theme's colours settle over their (hair-long) transitions, and WebKit can read the new surface under the old ink
    // for a frame: measure once they have (the settled pair is what a person sees; both themes pass at it).
    await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})));
    });
    for (const reduced of [false, true]) {
      const colors = await paint(reduced);
      expect(ratio(colors), `${theme}/${reduced ? "reduced" : "pulse"}: ${JSON.stringify(colors)}`).toBeGreaterThanOrEqual(3);
    }
  }
});


test("the stage's own voice-note bars keep 3:1 on the person's balloon, at the transcribing shimmer's dimmest and still", async ({ page }) => {
  await page.goto("/voice/");
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.className = "call-layout";
    host.innerHTML = `<div class="stage-tile" style="width: 100%; height: 640px"><div class="person-turns"><div class="speech-bubble person-bubble" data-live="">
      <span class="voice-wave" data-phase="transcribing"><canvas></canvas></span>
      <span class="voice-bars" data-phase="transcribing"><i></i></span><div class="person-live-actions"></div></div></div></div>`;
    document.body.replaceChildren(host);
  });
  for (const theme of ["light", "dark"]) {
    const paint = await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
      const bubble = document.querySelector(".person-bubble");
      return { canvas: getComputedStyle(document.querySelector(".voice-wave canvas")).color, bar: getComputedStyle(document.querySelector(".voice-bars i")).backgroundColor,
        wave: getComputedStyle(document.querySelector(".voice-wave")).backgroundColor, fill: getComputedStyle(bubble, "::before").backgroundColor,
        size: [bubble.offsetWidth, bubble.offsetHeight] };
    }, theme);
    // No pill of their own: the bars lie on the balloon's fill.
    expect(paint.wave, theme).toBe("rgba(0, 0, 0, 0)");
    // The shimmer dims the bars to 55% at its darkest (call-view.css person-wave-think's mask).
    const channels = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => value.startsWith("color(srgb ") ? v * 255 : v);
    const dimmed = channels(paint.canvas).map((v, i) => v * .55 + channels(paint.fill)[i] * .45);
    expect(contrast(`rgb(${dimmed.join(", ")})`, paint.fill), `${theme} shimmer`).toBeGreaterThanOrEqual(3);
    expect(contrast(paint.bar, paint.fill), `${theme} still`).toBeGreaterThanOrEqual(3);
  }
});
/** WCAG contrast between two computed colours (rgb() or color(srgb …)). */
function contrast(ink, surface) {
  const channels = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => value.startsWith("color(srgb ") ? v * 255 : v);
  const luminance = (rgb) => rgb.map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const [high, low] = [luminance(channels(ink)), luminance(channels(surface))].sort((x, y) => y - x);
  return (high + .05) / (low + .05);
}

const SAID = "Okay, so here's what I'd like you to do next. First, go through the settings pane and check that every toggle " +
  "still saves when you change it, because I think the one for automatic updates stopped doing that after yesterday's refactor.";

test("what is said on the stage is big and clear, the agent's bigger, three lines a page with the page before fading above, and whole for assistive tech", async ({ page }) => {
  // The agent's balloon a size up from the person's (2026-10-15): [size, line] of each, on a slide whose unit (--u) is
  // one px — the tile's --k set so (its height over the lab's 440, times 440 over the form factor's --stage-ref: the web
  // slide's 600, the phone's 360) — the line on whole pixels (the slide's 25.6/35.2 and 22.4/32, the phone's 22.4/32 and
  // 19.2/28.8).
  for (const [width, k, agent, person] of [[1280, 600 / 440, [25.6, 35], [22.4, 32]], [320, 360 / 440, [22.4, 32], [19.2, 29]]]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/voice/");
    await page.evaluate(([said, k]) => {
      const host = document.createElement("div");
      host.className = "call-layout";
      host.innerHTML = `<div class="stage-tile" data-mood="listening" style="width: 100%; height: 640px; --k: ${k}">
        <div class="stage-top"><div class="speech-bubble stage-bubble" data-visible="" aria-hidden="true"><span class="paged-text">
          <span class="paged-text-run"><span class="karaoke-text" data-playback="playing" data-progress="true"><span class="karaoke-played">${said.slice(0, 90)}</span><span class="karaoke-upcoming">${said.slice(90)}</span></span></span>
        </span></div></div>
        <div class="person-turns"><div class="speech-bubble person-bubble" data-sent=""><span class="person-said"><span class="paged-text">
          <span class="paged-text-run">${said}</span></span></span></div></div></div>`;
      document.body.replaceChildren(host);
    }, [SAID, k]);
    await page.evaluate(() => document.fonts.load('450 18px "DM Sans"'));
    for (const theme of ["light", "dark"]) {
      const paint = await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        const style = (selector) => getComputedStyle(document.querySelector(selector));
        const windows = [...document.querySelectorAll(".paged-text")].map((node) => ({
          page: node.clientHeight - parseFloat(getComputedStyle(node).paddingTop), strip: parseFloat(getComputedStyle(node).paddingTop),
          mask: getComputedStyle(node).maskImage || getComputedStyle(node).webkitMaskImage,
        }));
        const bubbles = [...document.querySelectorAll(".speech-bubble")].map((node) => node.getBoundingClientRect());
        return {
          type: [".stage-bubble", ".person-bubble"].map((selector) => ({ size: style(selector).fontSize, line: style(selector).lineHeight,
            weight: style(selector).fontWeight, family: style(selector).fontFamily })),
          loaded: document.fonts.check('450 18px "DM Sans"'),
          // The agent's balloon in each of its looks (CallStage `balloon`), on the palest, deepest and greyest coats a
          // bicho rolls and with none: its words said and still to say, on its fill (its skin, ::before). The person's
          // on theirs.
          inks: (() => {
            const bubble = document.querySelector(".stage-bubble"), tile = document.querySelector(".stage-tile"), found = {};
            for (const balloon of ["a", "b", "c"]) for (const tone of ["", "hsl(240 78% 46%)", "hsl(60 86% 56%)", "hsl(0 0% 92%)", "hsl(150 50% 66%)"]) {
              bubble.dataset.balloon = balloon;
              tile.style.setProperty("--av-color", tone);
              const fill = getComputedStyle(bubble, "::before").backgroundColor, as = `${balloon} ${tone || "no tone"}`;
              found[`${as} played`] = [style(".karaoke-played").color, fill];
              found[`${as} upcoming`] = [style(".karaoke-upcoming").color, fill];
            }
            delete bubble.dataset.balloon;
            tile.style.removeProperty("--av-color");
            found.person = [style(".person-said").color, getComputedStyle(document.querySelector(".person-bubble"), "::before").backgroundColor];
            return found;
          })(),
          windows, right: Math.max(...bubbles.map((box) => box.right)), left: Math.min(...bubbles.map((box) => box.left)),
          page: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
          said: document.querySelector(".person-said").textContent.trim(), hidden: document.querySelector(".person-bubble").closest("[aria-hidden=true]") !== null,
        };
      }, theme);
      const at = `${width}px ${theme}`;
      expect(paint.loaded, at).toBe(true);
      paint.type.forEach((type, index) => {
        const [size, line] = index ? person : agent;
        // The size is a computed float (WebKit says 19.200001px for 19.2px).
        expect(parseFloat(type.size), at).toBeCloseTo(size, 3);
        expect(type, at).toMatchObject({ line: `${line}px`, weight: "450" });
        expect(type.family, at).toMatch(/^"?DM Sans/);
      });
      for (const [name, [ink, surface]] of Object.entries(paint.inks)) expect(contrast(ink, surface), `${at} ${name}`).toBeGreaterThanOrEqual(4.5);
      // The stage's window, then the person's: three of its own lines each (before PagedText sets a height, CSS caps it).
      paint.windows.forEach((window, index) => {
        expect(window.page, at).toBe(3 * (index ? person : agent)[1]);
        expect(window.strip, at).toBeGreaterThan(0);
        expect(window.mask, at).toContain("linear-gradient");
      });
      expect(paint.left, at).toBeGreaterThanOrEqual(0);
      expect(paint.right, at).toBeLessThanOrEqual(paint.page);
      expect(paint.scroll, at).toBeLessThanOrEqual(paint.page);
      expect(paint.said, at).toBe(SAID);
      expect(paint.hidden, at).toBe(false);
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  // A page turns at once: no scroll (app.css leaves every transition a hair long, never a visible one).
  expect(parseFloat(await page.evaluate(() => getComputedStyle(document.querySelector(".paged-text-run")).transitionDuration))).toBeLessThan(.01);
  // Nor does a shorter last page ease to its height.
  expect(parseFloat(await page.evaluate(() => getComputedStyle(document.querySelector(".paged-text")).transitionDuration))).toBeLessThan(.01);
});
