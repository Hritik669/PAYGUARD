-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'VOIDED';
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDED';

-- CreateEnum
CREATE TYPE "MerchantEndpointStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "MerchantDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "merchant_endpoints" (
    "id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "signing_secret" TEXT NOT NULL,
    "event_types" JSONB NOT NULL,
    "status" "MerchantEndpointStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_deliveries" (
    "id" UUID NOT NULL,
    "endpoint_id" UUID NOT NULL,
    "payment_id" UUID,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "MerchantDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_delivery_attempts" (
    "id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "MerchantDeliveryStatus" NOT NULL,
    "response_code" INTEGER,
    "duration_ms" INTEGER,
    "error_summary" TEXT,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_sink_receipts" (
    "id" UUID NOT NULL,
    "endpoint_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payment_id" TEXT,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_sink_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merchant_endpoints_status_idx" ON "merchant_endpoints"("status");

-- CreateIndex
CREATE INDEX "merchant_deliveries_status_next_attempt_at_idx" ON "merchant_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "merchant_deliveries_payment_id_idx" ON "merchant_deliveries"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_delivery_attempts_delivery_id_attempt_number_key" ON "merchant_delivery_attempts"("delivery_id", "attempt_number");

-- CreateIndex
CREATE INDEX "merchant_sink_receipts_received_at_idx" ON "merchant_sink_receipts"("received_at");

-- AddForeignKey
ALTER TABLE "merchant_deliveries" ADD CONSTRAINT "merchant_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "merchant_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_deliveries" ADD CONSTRAINT "merchant_deliveries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_delivery_attempts" ADD CONSTRAINT "merchant_delivery_attempts_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "merchant_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
