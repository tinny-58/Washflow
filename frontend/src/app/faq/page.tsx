"use client";

import React, { useState, useId } from "react";
import Link from "next/link";
import {
  HelpCircle,
  Search,
  ChevronDown,
  ArrowRight,
  ShieldCheck,
  Calendar,
  CreditCard,
  Package,
  Gift,
  MessageSquare,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

interface FAQItem {
  id: string;
  topic: string;
  question: string;
  answer: string;
}

const FAQ_DATA: FAQItem[] = [
  // 1. Booking & Pickup
  {
    id: "how-to-book",
    topic: "Booking & Pickup",
    question: "How do I book a laundry pickup with WashFlow?",
    answer:
      "You can book directly on our website without installing an app. Select your basket, duvets, or floor mats on the booking screen, specify your doorstep address with a landmark or map pin, and pick your preferred time window (Morning, Midday, Afternoon, or Evening). A rider will arrive during your scheduled window.",
  },
  {
    id: "pickup-windows",
    topic: "Booking & Pickup",
    question: "What pickup time windows are available?",
    answer:
      "We operate four convenient daily pickup windows: Morning (8:00 AM – 11:00 AM), Midday (11:00 AM – 2:00 PM), Afternoon (2:00 PM – 5:00 PM), and Evening (5:00 PM – 8:00 PM). Our rider coordinates with you via WhatsApp before arrival.",
  },
  {
    id: "laundry-bag",
    topic: "Booking & Pickup",
    question: "Do I need to supply my own laundry bag?",
    answer:
      "No. You can place your clothes in any temporary bag or basket at your door. Our rider arrives with a sanitized, weather-resistant WashFlow laundry bag, weighs or inspects the items with you, and seals it for transport.",
  },

  // 2. Pricing & Payment
  {
    id: "pricing-snapshot",
    topic: "Pricing & Payment",
    question: "Are the prices on the website final?",
    answer:
      "Yes. Our public price catalog is the single source of truth. When you create a booking, a price snapshot is locked to your order. If catalog prices change in the future, your existing booking retains its original price. You are never subject to retroactive price increases.",
  },
  {
    id: "payment-methods",
    topic: "Pricing & Payment",
    question: "How and when do I pay?",
    answer:
      "We support secure payment via M-Pesa. You pay upon delivery after you have verified your clean, folded laundry. An automated M-Pesa STK push prompt can be sent directly to your phone, or you can pay via our official till/paybill number.",
  },
  {
    id: "minimum-order",
    topic: "Pricing & Payment",
    question: "Is there a minimum order amount?",
    answer:
      "Our smallest service is the Small Basket (up to 7 kg) at KES 300. There are no additional hidden surcharges.",
  },

  // 3. Baskets, Duvets & Mats
  {
    id: "basket-sizes",
    topic: "Baskets, Duvets & Mats",
    question: "What is the difference between Small and Large laundry baskets?",
    answer:
      "A Small Basket holds up to 7 kg of everyday wear (approximately 20–25 shirts/t-shirts or 1–2 weeks of clothing for one person). A Large Basket holds up to 15 kg (ideal for couples, families, or heavy denim and hoodies).",
  },
  {
    id: "duvets-cleaning",
    topic: "Baskets, Duvets & Mats",
    question: "How do you wash duvets and heavy bedding?",
    answer:
      "Duvets are washed in high-capacity machines with specialized thermal fiber cycles and anti-allergen steam sanitization. We service all dimensions: Single (3x5 ft), Medium (4x6 ft), Queen (5x6 ft), and King (6x6 ft).",
  },
  {
    id: "floor-mats",
    topic: "Baskets, Duvets & Mats",
    question: "Do you clean entrance and bathroom floor mats?",
    answer:
      "Yes. We clean doormats, bathroom mats, and large living room area rugs using rotary foam shampoo and high-power water extraction to eliminate embedded dust, stains, and odors.",
  },

  // 4. Delivery & Turnaround
  {
    id: "turnaround-time",
    topic: "Delivery & Turnaround",
    question: "What is the turnaround time for my laundry?",
    answer:
      "Standard wash-and-fold turnaround is typically 24 to 48 hours depending on the items. Duvets and heavy area mats may require additional drying and curing time to ensure complete moisture removal.",
  },
  {
    id: "delivery-coordination",
    topic: "Delivery & Turnaround",
    question: "How will I know when my laundry is ready?",
    answer:
      "You receive real-time order status updates via WhatsApp and on your Client Portal. When your laundry is clean and inspected, we notify you to confirm your delivery slot.",
  },

  // 5. Rewards (Referral & Loyalty)
  {
    id: "referral-program",
    topic: "Rewards (Referral & Loyalty)",
    question: "How does the referral program work?",
    answer:
      "Every registered client receives a unique referral link and code. When a friend signs up using your link, completes their first laundry order (delivered and paid via verified M-Pesa with minimum qualifying value of KES 300), and fraud checks pass, you earn 100 referral points. Reaching 500 points unlocks the Standard Reward (choice of free Small Basket up to 7 kg, Single Duvet, or Small Doormat capped at KES 300). Reaching 1,000 points unlocks the Exclusive Reward (free Large Basket up to 15 kg capped at KES 450).",
  },
  {
    id: "loyalty-program",
    topic: "Rewards (Referral & Loyalty)",
    question: "How does the loyalty program work?",
    answer:
      "Every completed and paid laundry order automatically credits 10 loyalty points to your account (orders covered entirely by a reward voucher earn none). Once you accumulate 100 loyalty points, you can claim a free Small Basket wash (capped at KES 300) on your next booking.",
  },
  {
    id: "reward-approval",
    topic: "Rewards (Referral & Loyalty)",
    question: "Why does my reward say 'Pending Approval'?",
    answer:
      "To protect the program against duplicate accounts and self-referral rings, all milestone rewards undergo an administrative security check before release (typically within a few hours). Once approved, your voucher is immediately accessible in your Rewards Wallet to apply at checkout.",
  },
  {
    id: "voucher-expiry",
    topic: "Rewards (Referral & Loyalty)",
    question: "Do reward points and vouchers expire?",
    answer:
      "Approved reward vouchers are valid for 90 days from the date of issue. Loyalty points remain valid for 12 months from your last order activity (with in-app reminders before expiry). Referral points never expire.",
  },

  // 6. WhatsApp Messages & Consent
  {
    id: "whatsapp-types",
    topic: "WhatsApp Messages & Consent",
    question: "What messages will WashFlow send to my WhatsApp?",
    answer:
      "We strictly separate transactional messages from promotional messages. Transactional messages (login OTPs, pickup arrival alerts, order tracking, and delivery receipts) are essential to fulfilling your service. Promotional messages (discounts and service news) are 100% optional and only sent if you explicitly opted in.",
  },
  {
    id: "whatsapp-stop",
    topic: "WhatsApp Messages & Consent",
    question: "How do I opt out of promotional WhatsApp messages?",
    answer:
      "You can opt out at any time by simply replying with the word 'STOP' to our WhatsApp number. Our system instantly records your withdrawal in our consent ledger and blocks future marketing messages. You will still receive essential order updates.",
  },

  // 7. Account & Security
  {
    id: "signup-methods",
    topic: "Account & Security",
    question: "How do I create an account?",
    answer:
      "You can sign up in seconds using your WhatsApp phone number with a secure One-Time Password (OTP), or with Google Sign-In. You never need to remember a complex password.",
  },
  {
    id: "session-security",
    topic: "Account & Security",
    question: "How are my sessions secured?",
    answer:
      "Sessions use cryptographically secure HTTP-only cookies with CSRF defense, IP binding, and idle expiration. If you remain inactive for an extended period, you will be prompted to re-authenticate.",
  },

  // 8. Lost or Damaged Items & Privacy
  {
    id: "damaged-items",
    topic: "Lost or Damaged Items",
    question: "What is your policy regarding damaged or lost garments?",
    answer:
      "Our riders and wash specialists inspect all garments prior to washing. If you believe an item was damaged or misplaced, you must report it within 24 hours of delivery with photographic evidence. Validated claims are resolved according to our standard garment liability policy outlined in our Terms & Conditions.",
  },
  {
    id: "privacy-policy",
    topic: "Data & Privacy",
    question: "How does WashFlow protect my personal data under Kenyan law?",
    answer:
      "We operate in strict adherence to Kenya's Data Protection Act 2019. We do not sell, rent, or disclose your personal details, phone number, or address coordinates to third-party marketers. Your data is stored securely and retained only for the duration necessary to provide services and comply with Kenyan accounting and tax obligations.",
  },
];

const TOPICS = [
  "All Topics",
  "Booking & Pickup",
  "Pricing & Payment",
  "Baskets, Duvets & Mats",
  "Delivery & Turnaround",
  "Rewards (Referral & Loyalty)",
  "WhatsApp Messages & Consent",
  "Account & Security",
  "Lost or Damaged Items",
  "Data & Privacy",
];

export default function FAQPage() {
  const [selectedTopic, setSelectedTopic] = useState<string>("All Topics");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({
    "how-to-book": true,
    "pricing-snapshot": true,
  });

  const toggleItem = (id: string) => {
    setOpenItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const filteredItems = FAQ_DATA.filter((item) => {
    const matchesTopic =
      selectedTopic === "All Topics" || item.topic === selectedTopic;
    const matchesSearch =
      searchQuery.trim() === "" ||
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTopic && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 md:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-10">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs font-semibold">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Frequently Asked Questions</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Clear answers about WashFlow
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
            Everything you need to know about our doorstep laundry service, pricing guarantees,
            reward rules, and data privacy.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md mx-auto">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search questions (e.g. duvets, STOP, M-Pesa)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl glass-input text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* Topic Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {TOPICS.map((topic) => {
            const isSelected = selectedTopic === topic;
            return (
              <button
                key={topic}
                type="button"
                onClick={() => setSelectedTopic(topic)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  isSelected
                    ? "bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20"
                    : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5"
                }`}
              >
                {topic}
              </button>
            );
          })}
        </div>

        {/* Accordion List */}
        <div className="space-y-3">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 rounded-2xl bg-slate-900/40 border border-white/5 text-slate-400 text-xs">
              No matching questions found. Try searching for a different keyword or topic.
            </div>
          ) : (
            filteredItems.map((item) => {
              const isOpen = !!openItems[item.id];
              const contentId = `faq-content-${item.id}`;
              const buttonId = `faq-btn-${item.id}`;

              return (
                <div
                  key={item.id}
                  id={item.id}
                  className="rounded-2xl bg-slate-900/60 border border-white/10 overflow-hidden transition hover:border-white/20"
                >
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={contentId}
                    onClick={() => toggleItem(item.id)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  >
                    <span className="text-sm font-bold text-white leading-snug">
                      {item.question}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-sky-400" : ""
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div
                      id={contentId}
                      role="region"
                      aria-labelledby={buttonId}
                      className="px-5 pb-5 pt-1 text-xs text-slate-300 leading-relaxed border-t border-white/5"
                    >
                      <p>{item.answer}</p>
                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-mono text-sky-400/80">{item.topic}</span>
                        <a
                          href={`#${item.id}`}
                          className="hover:text-slate-300 transition"
                          title="Anchor link to this question"
                        >
                          #link
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Contact Assistance Callout */}
        <div className="rounded-2xl bg-slate-900 border border-white/10 p-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <h3 className="text-sm font-bold text-white">Have a specific question not listed here?</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Our Nairobi customer care team is available on WhatsApp during operating hours.
            </p>
          </div>
          <Link
            href="/contact"
            className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition whitespace-nowrap"
          >
            <span>Contact Support</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
