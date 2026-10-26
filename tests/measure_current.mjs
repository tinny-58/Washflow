import { chromium } from "playwright";

async function run() {
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1918, height: 967 }
  });
  const page = await context.newPage();
  
  console.log("Navigating to http://localhost:3000...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 45000 });
  console.log("Waiting for form or AuthCard...");
  await page.waitForSelector("form", { timeout: 30000 });
  console.log("Loaded!");
  
  const cardData = await page.evaluate(() => {
    // Find the auth card container
    const form = document.querySelector("form");
    let card = form;
    while (card && !card.classList.contains("rounded-2xl")) {
      card = card.parentElement;
    }
    if (!card) card = form.parentElement.parentElement;
    
    const rect = card.getBoundingClientRect();
    const computed = window.getComputedStyle(card);
    
    // Find internal children
    const childDetails = [];
    for (const child of card.children) {
      const cr = child.getBoundingClientRect();
      const cs = window.getComputedStyle(child);
      childDetails.push({
        tag: child.tagName,
        className: child.className,
        rect: { x: cr.x, y: cr.y, width: cr.width, height: cr.height, top: cr.top },
        padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
        margin: `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`,
        children: Array.from(child.children).map(gc => {
          const gr = gc.getBoundingClientRect();
          return {
            tag: gc.tagName,
            className: gc.className,
            text: gc.textContent.slice(0, 40),
            rect: { x: gr.x, y: gr.y, width: gr.width, height: gr.height, top: gr.top }
          };
        })
      });
    }
    
    return {
      cardRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        bottom: rect.bottom,
        right: rect.right
      },
      cardPadding: `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`,
      cardClasses: card.className,
      childDetails
    };
  });
  
  console.log(JSON.stringify(cardData, null, 2));
  
  await browser.close();
}

run().catch(console.error);
