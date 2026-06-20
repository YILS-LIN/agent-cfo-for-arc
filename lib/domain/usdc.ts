const USDC_DECIMALS = 6;
const USDC_SCALE = BigInt(10) ** BigInt(USDC_DECIMALS);

export type UsdcAmount = string;

export function parseUsdc(value: UsdcAmount): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value)) {
    throw new Error(`Invalid USDC amount: ${value}`);
  }

  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * USDC_SCALE + BigInt(fraction.padEnd(USDC_DECIMALS, "0"));
}

export function formatUsdcUnits(value: bigint): UsdcAmount {
  const sign = value < BigInt(0) ? "-" : "";
  const absolute = value < BigInt(0) ? -value : value;
  const whole = absolute / USDC_SCALE;
  const fraction = (absolute % USDC_SCALE).toString().padStart(USDC_DECIMALS, "0");
  const trimmedFraction = fraction.replace(/0+$/, "");

  return `${sign}${whole}${trimmedFraction ? `.${trimmedFraction}` : ""}`;
}

export function sumUsdc(values: UsdcAmount[]): UsdcAmount {
  return formatUsdcUnits(values.reduce((total, value) => total + parseUsdc(value), BigInt(0)));
}

export function compareUsdc(left: UsdcAmount, right: UsdcAmount): number {
  const difference = parseUsdc(left) - parseUsdc(right);
  return difference === BigInt(0) ? 0 : difference > BigInt(0) ? 1 : -1;
}

export function divideUsdc(dividend: UsdcAmount, divisor: number): UsdcAmount {
  if (!Number.isInteger(divisor) || divisor <= 0) {
    return "0";
  }

  return formatUsdcUnits(parseUsdc(dividend) / BigInt(divisor));
}

export function usdcToNumber(value: UsdcAmount): number {
  return Number.parseFloat(value);
}
