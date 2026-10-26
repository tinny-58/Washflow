import fs from "fs";
import path from "path";
import { env } from "../src/lib/env";

const TARGET_DIRECTORIES = [
  path.resolve("frontend/src/app/(customer)"),
  path.resolve("frontend/src/app/(marketing)"),
  path.resolve("frontend/src/app/(auth)"),
  path.resolve("frontend/src/app/client"),
  path.resolve("frontend/src/components/customer"),
  path.resolve("frontend/src/components/shared"),
  path.resolve("backend/src/services/customer-messaging.ts"),
];

function extractPhoneVariants(phoneStr: string): string[] {
  if (!phoneStr) return [];
  const digits = phoneStr.replace(/\D/g, "");
  if (digits.length < 8) return [];

  const variants = new Set<string>();
  variants.add(phoneStr);
  variants.add(digits);
  if (digits.startsWith("254") && digits.length === 12) {
    variants.add("0" + digits.slice(3));
    variants.add("+" + digits);
    variants.add(digits.slice(3)); // 9 digits
  }
  return Array.from(variants);
}

export function runPrivacyScan(): { passed: boolean; violations: Array<{ file: string; line: number; match: string }> } {
  const adminNumbers = [
    env.ADMIN_PHONE,
    env.ADMIN_NOTIFY_PHONE,
    process.env.ADMIN_PHONE || "",
    process.env.ADMIN_NOTIFY_PHONE || "",
    // Also guard known administrator personal numbers
    "+254741617861",
    "+254706351077",
  ].filter(Boolean);

  const forbiddenTokens = new Set<string>();
  for (const num of adminNumbers) {
    for (const v of extractPhoneVariants(num)) {
      if (v && v.length >= 8 && !v.includes("000000")) {
        forbiddenTokens.add(v);
      }
    }
  }

  const violations: Array<{ file: string; line: number; match: string }> = [];

  function scanFile(filePath: string) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    lines.forEach((line, idx) => {
      for (const token of forbiddenTokens) {
        if (line.includes(token)) {
          violations.push({
            file: filePath,
            line: idx + 1,
            match: token,
          });
        }
      }
    });
  }

  function scanDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && /\.(tsx|ts|jsx|js|json|html|md)$/.test(entry.name)) {
        scanFile(fullPath);
      }
    }
  }

  for (const target of TARGET_DIRECTORIES) {
    if (fs.existsSync(target)) {
      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        scanDir(target);
      } else {
        scanFile(target);
      }
    }
  }

  return { passed: violations.length === 0, violations };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes("check-privacy")) {
  console.log("🔒 [OTF Washflow Privacy Scanner] Scanning customer-facing strings for admin phone exposure...");
  const result = runPrivacyScan();

  if (!result.passed) {
    console.error("\n❌ [PRIVACY VIOLATION] Administrator personal phone number detected in customer-facing files:");
    result.violations.forEach((v) => {
      console.error(`  - ${v.file}:${v.line} -> matched forbidden token "${v.match.slice(0, 4)}••••${v.match.slice(-2)}"`);
    });
    process.exit(1);
  } else {
    console.log("✅ [Privacy Check Passed] No administrator personal phone numbers exposed in customer-facing code or templates.\n");
    process.exit(0);
  }
}
