import { chromium } from "playwright";

async function checkSlide4() {
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1918, height: 967 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  await page.goto("http://localhost:3000/?view=login", { waitUntil: "networkidle" });
  await page.waitForSelector(".auth-card-shell");

  // Force slide index 3 (Slide 4: "24h Doorstep Delivery")
  // Or let's inspect the DOM and see what images are rendered
  await page.evaluate(() => {
    // If LandingCarousel has state, we can see what elements exist
    // Or let's find the img element
  });

  // Let's wait for slide 4 to rotate or force it
  // Slide duration is 5500ms per slide. Slide 1 (0), Slide 2 (5.5s), Slide 3 (11s), Slide 4 (16.5s)
  // Let's capture at 17s:
  console.log("Waiting 17s for slide 4...");
  await page.waitForTimeout(17000);

  const title = await page.evaluate(() => {
    return document.querySelector("h2")?.textContent;
  });
  console.log("Current slide title:", title);

  await page.screenshot({ path: "tests/screenshots/slide_at_17s.png" });

  const imgInfo = await page.evaluate(() => {
    const img = document.querySelector(".rounded-3xl img, .rounded-\\[2\\.5rem\\] img");
    return {
      src: img?.src,
      currentSrc: img?.currentSrc,
      naturalWidth: img?.naturalWidth,
      naturalHeight: img?.naturalHeight,
      complete: img?.complete,
      computedStyle: img ? window.getComputedStyle(img).cssText : null
    };
  });
  console.log("Image info:", imgInfo);

  await browser.close();
}

checkSlide4().catch(console.error);
