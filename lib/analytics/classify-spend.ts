import { formatUsdcUnits, parseUsdc, sumUsdc } from "@/lib/domain/usdc";
import type { CategorySummary, PaymentEvent, ProviderSummary } from "@/types/payment";

function share(amount: string, total: string) {
  const totalUnits = parseUsdc(total);
  if (totalUnits === BigInt(0)) {
    return 0;
  }

  return Number((parseUsdc(amount) * BigInt(1000)) / totalUnits) / 10;
}

export function getTotalSpend(payments: PaymentEvent[]) {
  return sumUsdc(payments.map((payment) => payment.amount));
}

export function summarizeProviders(payments: PaymentEvent[]): ProviderSummary[] {
  const total = getTotalSpend(payments);
  const providers = new Map<string, ProviderSummary>();

  for (const payment of payments) {
    const current = providers.get(payment.provider) ?? {
      provider: payment.provider,
      providerLogo: payment.providerLogo,
      amount: "0",
      paymentCount: 0,
      share: 0,
    };

    current.amount = formatUsdcUnits(parseUsdc(current.amount) + parseUsdc(payment.amount));
    current.paymentCount += 1;
    current.share = share(current.amount, total);
    providers.set(payment.provider, current);
  }

  return [...providers.values()].sort((a, b) => Number(parseUsdc(b.amount) - parseUsdc(a.amount)));
}

export function summarizeCategories(payments: PaymentEvent[]): CategorySummary[] {
  const total = getTotalSpend(payments);
  const categories = new Map<PaymentEvent["category"], CategorySummary>();

  for (const payment of payments) {
    const current = categories.get(payment.category) ?? {
      category: payment.category,
      amount: "0",
      paymentCount: 0,
      share: 0,
    };

    current.amount = formatUsdcUnits(parseUsdc(current.amount) + parseUsdc(payment.amount));
    current.paymentCount += 1;
    current.share = share(current.amount, total);
    categories.set(payment.category, current);
  }

  return [...categories.values()].sort((a, b) => Number(parseUsdc(b.amount) - parseUsdc(a.amount)));
}

export function getRecentPayments(payments: PaymentEvent[], limit = 6) {
  return [...payments]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}
