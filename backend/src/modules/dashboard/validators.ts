import { z } from "zod";
import { currencySchema } from "../../common/money";

export const dashboardQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  currency: currencySchema.optional(),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
