import type { CategorySummary, PaymentEvent, ProviderSummary } from "@/types/payment";

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function share(amount: number, total: number) {
  if (total === 0) {
    return 0;
  }

  return Math.round((amount / total) * 1000) / 10;
}

export function getTotalSpend(payments: PaymentEvent[]) {
  return roundCurrency(payments.reduce((sum, payment) => sum + payment.amount, 0));
}

export function summarizeProviders(payments: PaymentEvent[]): ProviderSummary[] {
  const total = getTotalSpend(payments);
  const providers = new Map<string, ProviderSummary>();

  for (const payment of payments) {
    const current = providers.get(payment.provider) ?? {
      provider: payment.provider,
      providerLogo: payment.providerLogo,
      amount: 0,
      paymentCount: 0,
      share: 0,
    };

    current.amount = roundCurrency(current.amount + payment.amount);
    current.paymentCount += 1;
    current.share = share(current.amount, total);
    providers.set(payment.provider, current);
  }

  return [...providers.values()].sort((a, b) => b.amount - a.amount);
}

export function summarizeCategories(payments: PaymentEvent[]): CategorySummary[] {
  const total = getTotalSpend(payments);
  const categories = new Map<PaymentEvent["category"], CategorySummary>();

  for (const payment of payments) {
    const current = categories.get(payment.category) ?? {
      category: payment.category,
      amount: 0,
      paymentCount: 0,
      share: 0,
    };

    current.amount = roundCurrency(current.amount + payment.amount);
    current.paymentCount += 1;
    current.share = share(current.amount, total);
    categories.set(payment.category, current);
  }

  return [...categories.values()].sort((a, b) => b.amount - a.amount);
}

export function getRecentPayments(payments: PaymentEvent[], limit = 6) {
  return [...payments]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}
