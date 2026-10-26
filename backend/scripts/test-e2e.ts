async function test() {
  const BASE_URL = "http://[::1]:5000";
  console.log("=== TEST 1: Check Username Availability ===");
  let res = await fetch(`${BASE_URL}/api/auth/check-username?username=admin`);
  let data: any = await res.json();
  console.log("Username 'admin':", data);

  const uniqueUname = "user_" + Math.floor(1000 + Math.random() * 9000);
  res = await fetch(`${BASE_URL}/api/auth/check-username?username=` + uniqueUname);
  data = await res.json();
  console.log("Username '" + uniqueUname + "':", data);

  console.log("\n=== TEST 2: Google Sign In (Setup Needed) ===");
  const googleEmail = "new_google_" + Date.now() + "@gmail.com";
  res = await fetch(`${BASE_URL}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: googleEmail, name: "Google Test Guy" }),
  });
  data = await res.json();
  console.log("Google Auth Response requiresSetup:", data.requiresSetup, "Suggested Username:", data.suggestedUsername);

  console.log("\n=== TEST 3: Google Setup -> Request WhatsApp OTP via Baileys ===");
  const googlePhone = "07" + Math.floor(10000000 + Math.random() * 90000000);
  res = await fetch(`${BASE_URL}/api/auth/google/request-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: googleEmail,
      name: "Google Test Guy",
      username: data.suggestedUsername,
      phone: googlePhone,
      password: "GoogleStrongPass2026!",
      referralCode: "WF-DAVID718",
    }),
  });
  data = await res.json();
  console.log("WhatsApp Code Dispatched:", data.success, "Phone:", data.phone, "DevCode:", data.devCode);

  console.log("\n=== TEST 4: Google Setup -> Verify OTP and Finalize Account ===");
  res = await fetch(`${BASE_URL}/api/auth/google/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: googleEmail,
      name: "Google Test Guy",
      username: "googleguy" + Date.now().toString().slice(-4),
      phone: data.phone,
      code: data.devCode,
      password: "GoogleStrongPass2026!",
      referralCode: "WF-DAVID718",
    }),
  });
  const setCookie = res.headers.get("set-cookie");
  data = await res.json();
  console.log("Verified User Role:", data.user?.role, "Username:", data.user?.username, "ReferralCode:", data.user?.referralCode);

  console.log("\n=== TEST 5: Verify Portal Overview Data ===");
  res = await fetch(`${BASE_URL}/api/client/overview`, {
    headers: { Cookie: setCookie || "" },
  });
  data = await res.json();
  console.log("Portal Client Name:", data.client?.name, "Role:", data.client?.role, "Royalty Points:", data.stats?.royaltyPoints, "Referral Points:", data.stats?.referralPoints);
  console.log("Recent Bookings with Receipt info count:", data.recentBookings?.length);

  console.log("\n=== TEST 6: Enforce Duplicate Username & Phone Protection ===");
  res = await fetch(`${BASE_URL}/api/auth/signup/request-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Duplicate Guy",
      username: "davidmwangi", // existing username
      phone: googlePhone, // existing phone
      password: "Password123!",
    }),
  });
  data = await res.json();
  console.log("Duplicate check rejected:", res.status, data.error);

  process.exit(0);
}

test().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
