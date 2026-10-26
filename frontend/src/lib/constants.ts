import { BookingStatus } from "./types";

export const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["WASHING", "CANCELLED"],
  WASHING: ["READY", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export const STATUS_METADATA: Record<
  BookingStatus,
  { label: string; description: string; step: number; color: string }
> = {
  PENDING: {
    label: "Booking Received",
    description: "Your pickup request has been received and is awaiting dispatcher confirmation.",
    step: 1,
    color: "bg-amber-500 text-amber-50",
  },
  CONFIRMED: {
    label: "Driver Assigned",
    description: "A pickup driver has been scheduled for your selected time window.",
    step: 2,
    color: "bg-blue-500 text-blue-50",
  },
  PICKED_UP: {
    label: "Picked Up",
    description: "Your laundry has been collected and is in transit to the washing facility.",
    step: 3,
    color: "bg-indigo-500 text-indigo-50",
  },
  WASHING: {
    label: "Washing & Drying",
    description: "Your clothes are being professionally washed, treated, dried, and fluffed.",
    step: 4,
    color: "bg-purple-500 text-purple-50",
  },
  READY: {
    label: "Quality Checked & Packed",
    description: "Your clean garments are folded, scented, and bagged ready for dispatch.",
    step: 5,
    color: "bg-teal-500 text-teal-50",
  },
  OUT_FOR_DELIVERY: {
    label: "Out for Delivery",
    description: "Your laundry is on the van heading to your doorstep.",
    step: 6,
    color: "bg-cyan-500 text-cyan-50",
  },
  DELIVERED: {
    label: "Delivered",
    description: "Order completed! Delivered fresh and crisp to your hands.",
    step: 7,
    color: "bg-emerald-500 text-emerald-50",
  },
  CANCELLED: {
    label: "Cancelled",
    description: "This booking was cancelled.",
    step: 0,
    color: "bg-rose-500 text-rose-50",
  },
};
