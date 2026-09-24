export type MoneyCurrency = "IRR" | "TOMAN";

export type Money = {
  amount: number;
  currency: MoneyCurrency;
};

export function assertMoneyAmount(amount: unknown): asserts amount is number {
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Invalid monetary amount");
  }
}

export function toman(amount: number): Money {
  assertMoneyAmount(amount);
  return { amount, currency: "TOMAN" };
}

export function irr(amount: number): Money {
  assertMoneyAmount(amount);
  return { amount, currency: "IRR" };
}
