import { chromium } from "playwright";
import fs from "fs";

async function measureAdminStepup() {
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1918, height: 967 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  
  // Go to landing page with Admin Verification view showing
  await page.goto("http://localhost:3000/?view=admin-stepup", { waitUntil: "networkidle" });
  await page.waitForSelector("input[maxLength='1']", { timeout: 10000 });
  await page.waitForTimeout(1000); // ensure any layout stabilizes
  
  // Save before screenshot
  await page.screenshot({ path: "tests/spec_admin_stepup_before.png" });
  console.log("Saved screenshot: tests/spec_admin_stepup_before.png");

  const measurement = await page.evaluate(() => {
    // Locate the card container
    const otpInput = document.querySelector("input[maxLength='1']");
    let card = otpInput;
    while (card && !card.classList.contains("rounded-2xl")) {
      card = card.parentElement;
    }
    if (!card) card = otpInput.closest("form").parentElement.parentElement;
    
    const cardRect = card.getBoundingClientRect();
    const cardStyle = window.getComputedStyle(card);
    
    // Internal elements
    // Header row: Back link + Step-Up Required badge
    const headerRow = card.querySelector(".flex.items-center.justify-between") || card.children[0]?.children[0];
    const headerRect = headerRow ? headerRow.getBoundingClientRect() : null;
    const headerStyle = headerRow ? window.getComputedStyle(headerRow) : null;
    
    // Title & subtitle row
    const titleBlock = card.querySelector("h2")?.parentElement;
    const titleRect = titleBlock ? titleBlock.getBoundingClientRect() : null;
    const titleStyle = titleBlock ? window.getComputedStyle(titleBlock) : null;
    
    // Body / form row (OTP boxes + button)
    const form = card.querySelector("form");
    const formRect = form ? form.getBoundingClientRect() : null;
    const formStyle = form ? window.getComputedStyle(form) : null;
    
    // Footer row: "Protected by WashFlow Zero-Knowledge..."
    const footer = card.lastElementChild;
    const footerRect = footer ? footer.getBoundingClientRect() : null;
    const footerStyle = footer ? window.getComputedStyle(footer) : null;
    
    // Hero container & parent info
    const parent = card.parentElement;
    const parentRect = parent ? parent.getBoundingClientRect() : null;
    const grandparent = parent?.parentElement;
    const grandparentRect = grandparent ? grandparent.getBoundingClientRect() : null;

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      card: {
        rect: {
          x: cardRect.x,
          y: cardRect.y,
          width: cardRect.width,
          height: cardRect.height,
          top: cardRect.top,
          left: cardRect.left,
          right: cardRect.right,
          bottom: cardRect.bottom
        },
        padding: {
          top: cardStyle.paddingTop,
          right: cardStyle.paddingRight,
          bottom: cardStyle.paddingBottom,
          left: cardStyle.paddingLeft
        },
        border: {
          top: cardStyle.borderTopWidth,
          right: cardStyle.borderRightWidth,
          bottom: cardStyle.borderBottomWidth,
          left: cardStyle.borderLeftWidth
        },
        boxSizing: cardStyle.boxSizing,
        className: card.className
      },
      rows: {
        header: {
          rect: headerRect ? {
            top: headerRect.top,
            height: headerRect.height,
            width: headerRect.width
          } : null,
          marginBottom: headerStyle ? headerStyle.marginBottom : null
        },
        title: {
          rect: titleRect ? {
            top: titleRect.top,
            height: titleRect.height,
            width: titleRect.width
          } : null,
          marginBottom: titleStyle ? titleStyle.marginBottom : null
        },
        body: {
          rect: formRect ? {
            top: formRect.top,
            height: formRect.height,
            width: formRect.width
          } : null
        },
        footer: {
          rect: footerRect ? {
            top: footerRect.top,
            height: footerRect.height,
            width: footerRect.width
          } : null,
          paddingTop: footerStyle ? footerStyle.paddingTop : null,
          marginTop: footerStyle ? footerStyle.marginTop : null,
          text: footer ? footer.textContent.trim() : null
        }
      },
      parent: {
        className: parent?.className,
        rect: parentRect ? {
          width: parentRect.width,
          height: parentRect.height,
          top: parentRect.top,
          left: parentRect.left
        } : null
      },
      grandparent: {
        className: grandparent?.className,
        rect: grandparentRect ? {
          width: grandparentRect.width,
          height: grandparentRect.height,
          top: grandparentRect.top
        } : null
      }
    };
  });
  
  console.log("MEASUREMENT SPEC RESULTS:");
  console.log(JSON.stringify(measurement, null, 2));
  
  await browser.close();
}

measureAdminStepup().catch(console.error);
