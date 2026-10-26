import { chromium } from "playwright";

async function inspectImages() {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage();

  // Test loading the png
  await page.goto("http://localhost:3000/images/services/service-fast-delivery.png");
  await page.screenshot({ path: "tests/screenshots/test_fast_delivery_png.png" });

  // Test loading the jpg
  await page.goto("http://localhost:3000/images/services/service-fast-delivery.jpg");
  await page.screenshot({ path: "tests/screenshots/test_fast_delivery_jpg.png" });

  // Test loading kenya-laundry-hero.jpg
  await page.goto("http://localhost:3000/images/kenya-laundry-hero.jpg");
  await page.screenshot({ path: "tests/screenshots/test_hero_jpg.png" });

  await browser.close();
  console.log("Screenshots captured!");
}

inspectImages().catch(console.error);
