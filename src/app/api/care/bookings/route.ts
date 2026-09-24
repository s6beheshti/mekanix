import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { getCustomerFromSession } from "@/lib/auth";

// POST /api/care/bookings — create a service booking
export async function POST(req: Request) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  const body = await req.json();
  const { vehicleId, packageId, serviceType, location, lat, lng, date, timeWindow, currentMileage } = body;

  if (!vehicleId || !location) {
    return NextResponse.json({ error: "خودرو و محل الزامی است" }, { status: 400 });
  }

  const customer = await getCustomerFromSession(session);
  if (!customer) return NextResponse.json({ error: "پروفایل مشتری یافت نشد" }, { status: 403 });

  // Verify vehicle ownership
  const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.customerId !== customer.id) {
    return NextResponse.json({ error: "خودرو متعلق به شما نیست" }, { status: 403 });
  }

  // Get package for pricing
  const pkg = packageId ? await db.servicePackage.findUnique({ where: { id: packageId }, include: { items: true } }) : null;

  // Create pricing snapshot
  const basePrice = pkg?.basePrice ?? 0;
  const visitPrice = 15000; // base visit fee
  const laborPrice = basePrice * 0.4;
  const partsPrice = basePrice * 0.5;
  const subtotal = basePrice + visitPrice + laborPrice + partsPrice;
  const taxRate = 0.09;
  const taxTotal = subtotal * taxRate;
  const total = subtotal + taxTotal;

  // Create booking + pricing snapshot in a transaction
  const result = await db.$transaction(async (tx) => {
    const code = `CARE-${Math.floor(100000 + Math.random() * 900000)}`;

    const booking = await tx.serviceBooking.create({
      data: {
        code,
        userId: session.userId,
        vehicleId,
        packageId: packageId || null,
        serviceType: serviceType || "periodic",
        location,
        lat: lat || null,
        lng: lng || null,
        date: date ? new Date(date) : null,
        timeWindow: timeWindow || null,
        currentMileage: currentMileage || null,
        status: "REQUESTED",
      },
    });

    // Create pricing snapshot
    const snapshot = await tx.pricingSnapshot.create({
      data: {
        bookingId: booking.id,
        servicePrice: basePrice,
        visitPrice,
        laborPrice,
        partsPrice,
        discount: 0,
        taxRate,
        taxTotal,
        total,
        currency: "USD",
      },
    });

    // Link snapshot to booking
    await tx.serviceBooking.update({
      where: { id: booking.id },
      data: { pricingSnapshotId: snapshot.id },
    });

    // Create timeline event
    await tx.serviceTimelineEvent.create({
      data: {
        bookingId: booking.id,
        eventType: "booking_created",
        actor: session.userId,
      },
    });

    return { booking, snapshot };
  });

  return NextResponse.json(result.booking);
}

// GET /api/care/bookings — list user's bookings
export async function GET(req: Request) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  const bookings = await db.serviceBooking.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    include: {
      package: true,
      timeline: { orderBy: { timestamp: "asc" } },
    },
  });

  return NextResponse.json(bookings);
}
