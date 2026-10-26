import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export async function enqueueMerchantNotifications(
  tx: Tx,
  input: { eventType: string; paymentId: string; payload: Prisma.InputJsonValue },
): Promise<void> {
  const endpoints = await tx.merchantEndpoint.findMany({ where: { status: "ACTIVE" } });
  for (const endpoint of endpoints) {
    const events = Array.isArray(endpoint.eventTypes) ? endpoint.eventTypes.filter((item): item is string => typeof item === "string") : [];
    if (!events.includes(input.eventType) && !events.includes("*")) continue;
    await tx.merchantDelivery.create({
      data: {
        endpointId: endpoint.id,
        paymentId: input.paymentId,
        eventType: input.eventType,
        payload: input.payload,
        status: "PENDING",
      },
    });
  }
}
