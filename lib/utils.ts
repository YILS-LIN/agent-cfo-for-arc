import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(value);
}

export function formatPercent(value: number, maximumFractionDigits = 1) {
  return `${value.toFixed(maximumFractionDigits)}%`;
}

export function compactAddress(address: string) {
  if (address.length <= 16) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
