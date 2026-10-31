import { initiatePayment } from "@/lib/payment-initiation";

export async function POST(req: Request) {
  return initiatePayment(req);
}
