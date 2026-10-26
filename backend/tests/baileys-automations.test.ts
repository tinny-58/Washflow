import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  getAutomationsConfig,
  DEFAULT_AUTOMATIONS,
} from "../src/lib/baileys/automations";

describe("Baileys WhatsApp Automations & Templating", () => {
  it("correctly renders template variables with customer and booking data", () => {
    const template =
      "Hello {{customerName}}, your booking #{{shortId}} is confirmed! Total: KES {{total}}. Track at {{trackingUrl}}";

    const rendered = renderTemplate(template, {
      customerName: "Grace Wanjiku",
      shortId: "wf-9812",
      total: "1,200",
      trackingUrl: "https://washflow.co.ke/track/wf-9812",
    });

    expect(rendered).toContain("Hello Grace Wanjiku");
    expect(rendered).toContain("booking #wf-9812 is confirmed!");
    expect(rendered).toContain("Total: KES 1,200");
    expect(rendered).toContain("Track at https://washflow.co.ke/track/wf-9812");
  });

  it("handles missing variables gracefully without leaving raw null or undefined", () => {
    const template = "Customer: {{customerName}}, Landmark: {{landmark}}";
    const rendered = renderTemplate(template, {
      customerName: "John Doe",
      landmark: null,
    });

    expect(rendered).toBe("Customer: John Doe, Landmark: ");
  });

  it("loads default automations with key booking triggers enabled", () => {
    const config = getAutomationsConfig();

    expect(config.BOOKING_CONFIRMED).toBeDefined();
    expect(config.BOOKING_CONFIRMED.enabled).toBe(true);
    expect(config.BOOKING_CONFIRMED.recipient).toBe("customer");
    expect(config.BOOKING_CONFIRMED.template).toContain("WashFlow Booking Confirmed!");

    expect(config.NEW_BOOKING_CUSTOMER).toBeDefined();
    expect(config.NEW_BOOKING_ADMIN).toBeDefined();
    expect(config.STATUS_DELIVERED).toBeDefined();
    expect(config.STATUS_DELIVERED.template).toContain("{{ratingUrl}}");
  });
});
