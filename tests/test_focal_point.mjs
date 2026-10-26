import { chromium } from "playwright";

async function testFocalPoint() {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1000, height: 860 } });

  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; background: #020617; display: flex; align-items: center; justify-content: center; height: 100vh; }
        .card {
          position: relative;
          width: 900px;
          height: 800px;
          border-radius: 2rem;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.15);
        }
        .bg-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 80%;
        }
        .gradient-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(2, 6, 23, 0.95) 0%, rgba(2, 6, 23, 0.5) 45%, rgba(2, 6, 23, 0.2) 100%);
        }
        .content {
          position: absolute;
          bottom: 0;
          left: 0;
          padding: 2.5rem;
          color: white;
          font-family: sans-serif;
          max-width: 600px;
        }
        h2 { font-size: 2.5rem; margin: 0 0 0.5rem 0; font-weight: 800; }
        p { font-size: 1.125rem; color: #cbd5e1; margin: 0; }
      </style>
    </head>
    <body>
      <div class="card">
        <img class="bg-img" src="http://localhost:3000/images/services/service-fast-delivery.png" />
        <div class="gradient-overlay"></div>
        <div class="content">
          <h2>24h Doorstep Delivery</h2>
          <p>Sealed tamper-evident return across Nairobi within 24 hours.</p>
        </div>
      </div>
    </body>
    </html>
  `);

  await page.waitForTimeout(1000);
  await page.screenshot({ path: "tests/screenshots/test_focal_point.png" });
  await browser.close();
  console.log("Focal point test screenshot saved!");
}

testFocalPoint().catch(console.error);
