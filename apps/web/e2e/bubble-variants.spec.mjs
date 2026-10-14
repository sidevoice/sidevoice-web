import { test, expect } from "@playwright/test";

test("proposed bubbles keep interrupted replies distinct in both themes", async ({ page }) => {
  await page.goto("/voice/");
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.className = "call-layout";
    host.innerHTML = `<div class="chat-bubble" data-role="assistant" data-position="only">Complete</div>
      <div class="chat-bubble" data-role="assistant" data-position="only" data-interrupted="true">Interrupted</div>
      <div class="chat-bubble" data-role="user" data-position="only">Person</div>`;
    document.body.append(host);
  });
  for (const theme of ["light", "dark"]) for (const proposal of ["soft", "illustrated", "panel"]) {
    const paints = await page.evaluate(({ theme, proposal }) => {
      document.documentElement.dataset.theme = theme;
      const host = document.querySelector(".call-layout");
      host.dataset.bubblesStyle = proposal;
      const [complete, interrupted, person] = host.querySelectorAll(".chat-bubble");
      return {
        complete: getComputedStyle(complete).boxShadow,
        interrupted: getComputedStyle(interrupted).boxShadow,
        outline: getComputedStyle(interrupted).outlineStyle,
        agentTail: getComputedStyle(complete, "::after").content,
        personTail: getComputedStyle(person, "::after").content,
      };
    }, { theme, proposal });
    expect(paints.interrupted, `${theme}/${proposal}`).not.toBe(paints.complete);
    expect(paints.interrupted, `${theme}/${proposal}`).toContain("inset");
    if (proposal === "panel") expect(paints.outline).toBe("dashed");
    if (proposal === "illustrated") {
      expect(paints.agentTail).toBe('""');
      expect(paints.personTail).toBe('""');
    }
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
      const canvas = document.querySelector(".voice-wave canvas");
      const bar = document.querySelector(".voice-bars i");
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
  for (const theme of ["light", "dark"]) for (const proposal of ["soft", "illustrated", "panel"]) {
    await page.evaluate(({ theme, proposal }) => {
      document.documentElement.dataset.theme = theme;
      document.querySelector(".call-layout").dataset.bubblesStyle = proposal;
    }, { theme, proposal });
    for (const reduced of [false, true]) {
      const colors = await paint(reduced);
      expect(ratio(colors), `${theme}/${proposal}/${reduced ? "reduced" : "pulse"}: ${JSON.stringify(colors)}`).toBeGreaterThanOrEqual(3);
    }
  }
});
