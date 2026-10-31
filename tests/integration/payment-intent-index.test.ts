import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL ?? "file:./test.db" });

const indexName = "PaymentGatewayLog_pending_user_purpose_key";

describe.skipIf(process.env.CI !== "true")("pending payment database guard", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("adds the nullable hosted payment URL column", async () => {
    if (process.env.DATABASE_URL?.startsWith("postgres")) {
      const columns = await db.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'PaymentGatewayLog'
          AND column_name = 'paymentUrl'
      `;
      expect(columns).toHaveLength(1);
      return;
    }

    const columns = await db.$queryRawUnsafe<Array<{ name: string }>>(
      'PRAGMA table_info("PaymentGatewayLog")',
    );
    expect(columns.some((column) => column.name === "paymentUrl")).toBe(true);
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
