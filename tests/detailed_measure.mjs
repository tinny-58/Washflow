import { chromium } from "playwright";

async function detailedMeasure() {
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1918, height: 967 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  
  await page.goto("http://localhost:3000/?view=admin-stepup", { waitUntil: "networkidle" });
  await page.waitForSelector("input[maxLength='1']", { timeout: 10000 });
  await page.waitForTimeout(500);

  const data = await page.evaluate(() => {
    const card = document.querySelector(".backdrop-blur-xl.rounded-2xl");
    const rect = card.getBoundingClientRect();
    const style = window.getComputedStyle(card);
    
    // Top-level children of card
    const topChildren = Array.from(card.children).map(child => {
      const cr = child.getBoundingClientRect();
      const cs = window.getComputedStyle(child);
      return {
        tag: child.tagName,
        className: child.className,
        rect: { top: cr.top, left: cr.left, width: cr.width, height: cr.height },
        padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
        margin: `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`,
        children: Array.from(child.children).map(c => {
          const r = c.getBoundingClientRect();
          const s = window.getComputedStyle(c);
          return {
            tag: c.tagName,
            className: c.className,
            text: c.textContent.trim().slice(0, 60),
            rect: { top: r.top, left: r.left, width: r.width, height: r.height },
            margin: `${s.marginTop} ${s.marginRight} ${s.marginBottom} ${s.marginLeft}`,
            padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`
          };
        })
      };
    });

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      cardRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom
      },
      cardPadding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
      cardBorder: `${style.borderTopWidth} ${style.borderRightWidth} ${style.borderBottomWidth} ${style.borderLeftWidth}`,
      boxSizing: style.boxSizing,
      topChildren
    };
  });

  console.log(JSON.stringify(data, null, 2));
  await browser.close();
}

detailedMeasure().catch(console.error);
