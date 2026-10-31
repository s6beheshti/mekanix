import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL ?? "file:./test.db" });

const indexName = "PaymentGatewayLog_pending_user_purpose_key";

describe.skipIf(process.env.CI !== "true")("pending payment database guard", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("applies the partial unique index in the active database provider", async () => {
    if (process.env.DATABASE_URL?.startsWith("postgresql://")) {
      const indexes = await db.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = ${indexName}
      `;
      expect(indexes).toHaveLength(1);
      expect(indexes[0].indexname).toBe(indexName);
      return;
    }

    const indexes = await db.$queryRaw<Array<{ name: string }>>`
      SELECT name
      FROM sqlite_master
      WHERE type = 'index' AND name = ${indexName}
    `;
    expect(indexes).toHaveLength(1);
    expect(indexes[0].name).toBe(indexName);
  });
});
