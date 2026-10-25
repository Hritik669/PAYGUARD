import { createHash } from "crypto";

export const GATEWAY_SCENARIOS = ["success", "decline", "gateway_failure", "timeout", "delayed_webhook"] as const;
export type GatewayScenario = (typeof GATEWAY_SCENARIOS)[number];

export type GatewayResult =
  | {
      kind: "approved";
      providerReference: string;
      eventType: "payment.succeeded";
      delayMs: number;
    }
  | {
      kind: "declined";
      providerReference: string;
      failureCode: string;
      failureMessage: string;
      eventType: "payment.failed";
      delayMs: number;
    }
  | { kind: "unavailable"; failureCode: string; failureMessage: string }
  | {
      kind: "ambiguous";
      providerReference: string;
      failureCode: string;
      failureMessage: string;
    }
  | {
      kind: "accepted";
      providerReference: string;
      eventType: "payment.succeeded";
      delayMs: number;
    };

export interface PaymentGateway {
  authorize(input: {
    paymentId: string;
    scenario: GatewayScenario;
    merchantReference: string;
    amountMinor: number;
    currency: string;
  }): Promise<GatewayResult>;
}

export function deterministicProviderReference(paymentId: string): string {
  return `sim_${createHash("sha256").update(paymentId).digest("hex").slice(0, 24)}`;
}

export class SimulatedGateway implements PaymentGateway {
  async authorize(input: {
    paymentId: string;
    scenario: GatewayScenario;
    merchantReference: string;
    amountMinor: number;
    currency: string;
  }): Promise<GatewayResult> {
    const providerReference = deterministicProviderReference(input.paymentId);
    switch (input.scenario) {
      case "success":
        return { kind: "approved", providerReference, eventType: "payment.succeeded", delayMs: 0 };
      case "decline":
        return {
          kind: "declined",
          providerReference,
          failureCode: "CARD_DECLINED",
          failureMessage: "The simulated issuer declined this payment.",
          eventType: "payment.failed",
          delayMs: 0,
        };
      case "gateway_failure":
        return {
          kind: "unavailable",
          failureCode: "GATEWAY_UNAVAILABLE",
          failureMessage: "The simulated gateway is temporarily unavailable.",
        };
      case "timeout":
        return {
          kind: "ambiguous",
          providerReference,
          failureCode: "GATEWAY_TIMEOUT",
          failureMessage:
            "The simulated gateway timed out before confirming an outcome. Do not treat this payment as failed.",
        };
      case "delayed_webhook":
        return { kind: "accepted", providerReference, eventType: "payment.succeeded", delayMs: 4000 };
      default:
        return {
          kind: "unavailable",
          failureCode: "UNKNOWN_SCENARIO",
          failureMessage: "Unsupported sandbox scenario.",
        };
    }
  }
}

export const paymentGateway: PaymentGateway = new SimulatedGateway();
