"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  User,
  ShieldCheck,
  Lock,
  Smartphone,
  MapPin,
  Bell,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  KeyRound,
  Eye,
  EyeOff,
  Plus,
  Edit2,
  X,
  CreditCard,
  Building,
  Home,
  Check,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  StatusChip,
} from "@/components/shared";
import { LocationPicker, SelectedLocation } from "@/components/customer/location-picker";

type SettingsSection =
  | "profile"
  | "security"
  | "payments"
  | "addresses"
  | "notifications"
  | "privacy";

interface ProfileData {
  id: string;
  name: string;
  username?: string;
  email?: string;
  phone: string;
  businessName?: string;
  role: string;
  authProvider: string;
  phoneVerifiedAt?: string;
  whatsappNotifications: boolean;
  marketingConsent?: boolean;
  createdAt: string;
}

interface ActiveSession {
  id: string;
  userAgent: string;
  ipMasked: string;
  createdAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
}

interface AddressItem {
  id: string;
  label: string;
  lat: number;
  lng: number;
  addressText: string;
  landmark?: string | null;
  createdAt: string;
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSection = (searchParams.get("tab") as SettingsSection) || "profile";

  const [activeTab, setActiveTab] = useState<SettingsSection>(initialSection);
  const [loading, setLoading] = useState<boolean>(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  // Profile Form State
  const [name, setName] = useState<string>("");
  const [businessName, setBusinessName] = useState<string>("");
  const [profileSaving, setProfileSaving] = useState<boolean>(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [passwordSaving, setPasswordSaving] = useState<boolean>(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Sessions State
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);

  // Addresses State
  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [addressModalOpen, setAddressModalOpen] = useState<boolean>(false);
  const [editingAddress, setEditingAddress] = useState<AddressItem | null>(null);
  const [location, setLocation] = useState<SelectedLocation>({
    lat: -1.286389,
    lng: 36.817223,
    addressText: "",
    landmark: "",
    label: "Home",
  });
  const [addressSaving, setAddressSaving] = useState<boolean>(false);
  const [addressMsg, setAddressMsg] = useState<string | null>(null);

  // Notifications State
  const [whatsappNotifications, setWhatsappNotifications] = useState<boolean>(true);
  const [marketingConsent, setMarketingConsent] = useState<boolean>(false);
  const [notifSaving, setNotifSaving] = useState<boolean>(false);

  // Phone Change Modal
  const [phoneModalOpen, setPhoneModalOpen] = useState<boolean>(false);
  const [newPhone, setNewPhone] = useState<string>("");
  const [otpCode, setOtpCode] = useState<string>("");
  const [phoneStep, setPhoneStep] = useState<1 | 2>(1);
  const [phoneLoading, setPhoneLoading] = useState<boolean>(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Account Deletion Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState<string>("");
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

  const fetchData = useCallback(async () => {
    try {
      const [profileRes, sessionsRes, addressesRes] = await Promise.all([
        fetch("/api/client/profile"),
        fetch("/api/client/profile/sessions"),
        fetch("/api/client/addresses"),
      ]);

      if (profileRes.ok) {
        const pData = await profileRes.json();
        if (pData.success && pData.profile) {
          setProfile(pData.profile);
          setName(pData.profile.name || "");
          setBusinessName(pData.profile.businessName || "");
          setWhatsappNotifications(Boolean(pData.profile.whatsappNotifications));
        }
      }

      if (sessionsRes.ok) {
        const sData = await sessionsRes.json();
        if (sData.success && Array.isArray(sData.sessions)) {
          setSessions(sData.sessions);
        }
      }

      if (addressesRes.ok) {
        const aData = await addressesRes.json();
        if (aData.success && Array.isArray(aData.addresses)) {
          setAddresses(aData.addresses);
        }
      }
    } catch (err) {
      console.error("Failed to load settings data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Save Profile Name
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/client/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, businessName }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setProfileMsg({ type: "success", text: "Profile details updated successfully." });
      } else {
        setProfileMsg({ type: "error", text: data.error || "Failed to update profile." });
      }
    } catch {
      setProfileMsg({ type: "error", text: "Network error updating profile." });
    } finally {
      setProfileSaving(false);
    }
  };

  // Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "New passwords do not match." });
      return;
    }
    setPasswordSaving(true);
    setPasswordMsg(null);
    try {
      const res = await fetch("/api/client/profile/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPasswordMsg({ type: "success", text: "Password changed successfully." });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPasswordMsg({ type: "error", text: data.error || "Failed to change password." });
      }
    } catch {
      setPasswordMsg({ type: "error", text: "Network error updating password." });
    } finally {
      setPasswordSaving(false);
    }
  };

  // Revoke session
  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    try {
      const res = await fetch(`/api/client/profile/sessions/${sessionId}/revoke`, {
        method: "POST",
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      }
    } finally {
      setRevokingSessionId(null);
    }
  };

  // Toggle Notifications
  const handleToggleWhatsAppNotifications = async (val: boolean) => {
    setWhatsappNotifications(val);
    setNotifSaving(true);
    try {
      await fetch("/api/client/profile/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappNotifications: val }),
      });
    } finally {
      setNotifSaving(false);
    }
  };

  // Export Data Download
  const handleExportData = () => {
    window.location.href = "/api/client/profile/export";
  };

  const tabs: { id: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "profile", label: "Profile", icon: User },
    { id: "security", label: "Login & Security", icon: ShieldCheck },
    { id: "payments", label: "Payment Numbers", icon: CreditCard },
    { id: "addresses", label: "Saved Addresses", icon: MapPin },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "privacy", label: "Privacy & Data", icon: Lock },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Settings Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
          Account Settings
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Manage your personal details, security credentials, delivery pins, and privacy consent.
        </p>
      </div>

      {/* Settings Nav Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-white/10 scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition shrink-0 outline-none ${
                isActive
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/30 shadow-lg shadow-sky-500/10"
                  : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. PROFILE SECTION */}
      {activeTab === "profile" && (
        <Card variant="glass" className="space-y-6">
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Update your display name and primary account identity.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4 max-w-md">
              {profileMsg && (
                <div
                  className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                    profileMsg.type === "success"
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                      : "bg-rose-500/15 border-rose-500/30 text-rose-300"
                  }`}
                >
                  {profileMsg.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span>{profileMsg.text}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs sm:text-sm text-white focus:outline-none focus:border-sky-400"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Username</label>
                <input
                  type="text"
                  value={profile?.username || "Not set"}
                  disabled
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/50 border border-white/5 text-xs text-slate-400 cursor-not-allowed font-mono"
                />
                <span className="text-[10px] text-slate-500">
                  Usernames are locked to ensure anti-impersonation integrity.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Estate or Business Name (Optional)</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Kilimani Heights Apt 4B"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs sm:text-sm text-white focus:outline-none focus:border-sky-400"
                />
              </div>

              <button
                type="submit"
                disabled={profileSaving}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs sm:text-sm font-semibold transition disabled:opacity-50"
              >
                {profileSaving ? "Saving changes..." : "Save Profile Details"}
              </button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* 2. SECURITY SECTION */}
      {activeTab === "security" && (
        <div className="space-y-6">
          <Card variant="glass" className="space-y-5">
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>
                Update your account password. Ensure it meets NIST guidelines (minimum 10 characters).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                {passwordMsg && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                      passwordMsg.type === "success"
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                        : "bg-rose-500/15 border-rose-500/30 text-rose-300"
                    }`}
                  >
                    {passwordMsg.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    <span>{passwordMsg.text}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Current Password</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs sm:text-sm text-white focus:outline-none focus:border-sky-400"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">New Password</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs sm:text-sm text-white focus:outline-none focus:border-sky-400"
                    minLength={10}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Confirm New Password</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs sm:text-sm text-white focus:outline-none focus:border-sky-400"
                    minLength={10}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs sm:text-sm font-semibold transition disabled:opacity-50"
                >
                  {passwordSaving ? "Updating password..." : "Update Password"}
                </button>
              </form>
            </CardContent>
          </Card>

          {/* Active Sessions */}
          <Card variant="glass" className="space-y-4">
            <CardHeader>
              <CardTitle>Active Browser Sessions</CardTitle>
              <CardDescription>Review all active devices logged into your account.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-white/5">
                {sessions.map((s) => (
                  <div key={s.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{s.userAgent}</span>
                        {s.isCurrent && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Current Device
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {s.ipMasked} • Last active {new Date(s.lastActiveAt).toLocaleDateString()}
                      </span>
                    </div>

                    {!s.isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleRevokeSession(s.id)}
                        disabled={revokingSessionId === s.id}
                        className="text-xs text-rose-400 hover:text-rose-300 font-semibold p-1.5 hover:bg-rose-500/10 rounded-lg transition"
                      >
                        {revokingSessionId === s.id ? "Revoking..." : "Revoke Session"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 3. PAYMENT NUMBERS */}
      {activeTab === "payments" && (
        <Card variant="glass" className="space-y-5">
          <CardHeader>
            <CardTitle>Verified M-Pesa Payment Numbers</CardTitle>
            <CardDescription>
              To protect against unauthorized STK push abuse, payment prompts are sent only to verified phone numbers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white text-xs sm:text-sm">
                      {profile?.phone || "No phone linked"}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Primary & Verified
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Linked to WhatsApp and verified via one-time PIN.
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4. SAVED ADDRESSES */}
      {activeTab === "addresses" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">Saved Delivery Pins</h3>
              <p className="text-xs text-slate-400">Manage your frequent laundry pickup & drop-off locations.</p>
            </div>

            <button
              type="button"
              onClick={() => setAddressModalOpen(true)}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 text-white text-xs font-semibold shadow-lg shadow-sky-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Address</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {addresses.map((addr) => (
              <Card key={addr.id} variant="glass" className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                      {addr.label.toLowerCase().includes("office") ? (
                        <Building className="w-4 h-4" />
                      ) : (
                        <Home className="w-4 h-4" />
                      )}
                    </div>
                    <span className="font-bold text-white text-xs sm:text-sm">{addr.label}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{addr.addressText}</p>
                {addr.landmark && (
                  <span className="text-[11px] text-sky-400 font-mono block">Landmark: {addr.landmark}</span>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 5. NOTIFICATIONS */}
      {activeTab === "notifications" && (
        <Card variant="glass" className="space-y-6">
          <CardHeader>
            <CardTitle>Communication Preferences</CardTitle>
            <CardDescription>
              Configure how WashFlow reaches out with order tracking and promotion updates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/[0.02]">
              <div>
                <span className="text-xs sm:text-sm font-bold text-white block">WhatsApp Order Status Updates</span>
                <span className="text-xs text-slate-400 mt-0.5 block max-w-md">
                  Receive live WhatsApp messages when your rider is en route, laundry enters wash cycle, and pickup receipts.
                </span>
              </div>
              <input
                type="checkbox"
                checked={whatsappNotifications}
                onChange={(e) => handleToggleWhatsAppNotifications(e.target.checked)}
                className="w-5 h-5 accent-sky-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/[0.02]">
              <div>
                <span className="text-xs sm:text-sm font-bold text-white block">Promotional & Loyalty Rewards</span>
                <span className="text-xs text-slate-400 mt-0.5 block max-w-md">
                  Opt-in to occasional discounts and bonus points alerts. Never pre-ticked, withdrawable anytime.
                </span>
              </div>
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="w-5 h-5 accent-sky-500 cursor-pointer"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 6. PRIVACY & DATA */}
      {activeTab === "privacy" && (
        <Card variant="glass" className="space-y-6">
          <CardHeader>
            <CardTitle>Privacy & Data Protection</CardTitle>
            <CardDescription>
              In accordance with Kenya Data Protection Act 2019, you retain full rights over your data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/[0.02]">
              <div>
                <span className="text-xs sm:text-sm font-bold text-white block">Export My Data</span>
                <span className="text-xs text-slate-400 mt-0.5 block max-w-md">
                  Download a structured JSON archive containing your full order history, saved pins, and payment receipts.
                </span>
              </div>
              <button
                type="button"
                onClick={handleExportData}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 transition"
              >
                <Download className="w-4 h-4 text-sky-400" />
                <span>Download Archive</span>
              </button>
            </div>

            <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-3">
              <span className="text-xs sm:text-sm font-bold text-rose-300 block">Delete Account & Anonymize</span>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                Anonymizes your personal identifying information and terminates all active sessions. Financial records and tax invoices are retained in anonymized format in accordance with Kenya statutory accounting regulations.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ClientSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto py-12 text-center text-slate-400 text-xs">
          Loading account settings...
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
