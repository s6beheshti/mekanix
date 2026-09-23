// MEKANIX — Iranian vehicle database (comprehensive)
// Includes ALL Iranian assemblers (مونتاژ) + importers with their full model
// catalogs and rich per-model metadata (years, segment, engine, fuel, notes).

export type VehicleSegment =
  | "sedan"
  | "hatchback"
  | "liftback"
  | "suv"
  | "crossover"
  | "pickup"
  | "van"
  | "minibus"
  | "coupe"
  | "ev"
  | "commercial";

export type VehicleFuel = "petrol" | "diesel" | "hybrid" | "ev" | "cng" | "lpg";

export interface VehicleModel {
  name: string;
  years?: string;       // "2001-2013" / "2020-present" / "2006-present"
  segment?: VehicleSegment;
  engine?: string;       // "1.6L 16v TU5"
  fuel?: VehicleFuel;
  notes?: string;        // montage base, Iranian-specific notes
}

export interface VehicleMake {
  make: string;
  country: string;            // "ایران" / "فرانسه" / ...
  assembler?: string;         // Iranian assembler/importer name if applicable
  founded?: number;
  description?: string;
  models: string[];           // flat list (backward compatible)
  catalog?: VehicleModel[];   // rich per-model data
}

// ──────────── PASSENGER VEHICLES (خودروی سواری) ────────────
// Iranian assemblers / manufacturers FIRST, then importers,
// then major foreign brands commonly seen on Iranian roads.

export const PASSENGER_MAKES: VehicleMake[] = [
  // ═══════════ Iranian Manufacturers / Assemblers ═══════════
  {
    make: "Iran Khodro (IKCO)",
    country: "ایران",
    assembler: "ایران خودرو",
    founded: 1962,
    description: "بزرگ‌ترین خودروساز ایران. تولیدکننده پژو، سمند، دنا، تارا و محصولات مونتاژی.",
    models: [
      "Peugeot 206 (Type 5)", "Peugeot 206 SD", "Peugeot 207i", "Peugeot 207i SD",
      "Peugeot 405", "Peugeot 405 SLX", "Peugeot Pars", "Peugeot Pars ELX",
      "Peugeot SD", "Peugeot ROA", "Samand", "Samand LX", "Samand ELX",
      "Samand Soren", "Samand Soren EX", "Samand Taxi",
      "Dena", "Dena Plus", "Dena Plus Turbo",
      "Runna", "Runna Plus", "Arisan Risi",
      "Tara", "KJ (IKCO Cayenne)", "Haima S7 (IKCO)", "IKCO Dami pickup",
    ],
    catalog: [
      { name: "Peugeot 206 (Type 5)", years: "2001-2013", segment: "hatchback", engine: "1.4L / 1.6L TU5", fuel: "petrol" },
      { name: "Peugeot 206 SD", years: "2006-present", segment: "sedan", engine: "1.6L TU5", fuel: "petrol", notes: "نسخه سدان ۲۰۶ مونتاژ ایران خودرو" },
      { name: "Peugeot 207i", years: "2010-2018", segment: "hatchback", engine: "1.6L TU5", fuel: "petrol" },
      { name: "Peugeot 207i SD", years: "2011-2018", segment: "sedan", engine: "1.6L TU5", fuel: "petrol" },
      { name: "Peugeot 405", years: "1990-2022", segment: "sedan", engine: "1.8L XU7", fuel: "petrol", notes: "طولانی‌ترین تولید پژو در ایران" },
      { name: "Peugeot 405 SLX", years: "1990-2020", segment: "sedan", engine: "1.8L XU7", fuel: "petrol" },
      { name: "Peugeot Pars", years: "2006-2020", segment: "sedan", engine: "1.8L XU7", fuel: "petrol", notes: "فیس‌لیفت ۴۰۵" },
      { name: "Peugeot Pars ELX", years: "2008-2020", segment: "sedan", engine: "1.8L XU7", fuel: "petrol" },
      { name: "Peugeot SD", years: "2008-2012", segment: "sedan", engine: "1.8L XU7", fuel: "petrol" },
      { name: "Peugeot ROA", years: "2008-2015", segment: "sedan", engine: "1.6L TU5", fuel: "petrol" },
      { name: "Samand", years: "2000-2020", segment: "sedan", engine: "1.8L XU7 / 1.6L TU5", fuel: "petrol", notes: "خودرو ملی ایران" },
      { name: "Samand LX", years: "2003-2018", segment: "sedan", engine: "1.8L XU7", fuel: "petrol" },
      { name: "Samand ELX", years: "2007-2018", segment: "sedan", engine: "1.8L XU7", fuel: "petrol" },
      { name: "Samand Soren", years: "2007-2020", segment: "sedan", engine: "1.8L XU7 / 1.7L EF7", fuel: "petrol" },
      { name: "Samand Soren EX", years: "2014-2020", segment: "sedan", engine: "1.7L EF7 turbo", fuel: "petrol" },
      { name: "Samand Taxi", years: "2003-2020", segment: "sedan", engine: "1.6L TU5 / CNG", fuel: "cng" },
      { name: "Dena", years: "2011-present", segment: "sedan", engine: "1.7L EF7", fuel: "petrol", notes: "جانشین سمند" },
      { name: "Dena Plus", years: "2018-present", segment: "sedan", engine: "1.7L EF7", fuel: "petrol" },
      { name: "Dena Plus Turbo", years: "2021-present", segment: "sedan", engine: "1.5L turbo", fuel: "petrol" },
      { name: "Runna", years: "2012-2020", segment: "sedan", engine: "1.4L TU3", fuel: "petrol" },
      { name: "Runna Plus", years: "2016-2020", segment: "sedan", engine: "1.4L TU3", fuel: "petrol" },
      { name: "Arisan Risi", years: "2018-present", segment: "hatchback", engine: "1.5L", fuel: "petrol", notes: "نسخه فیس‌لیفت ۲۰۷" },
      { name: "Tara", years: "2021-present", segment: "sedan", engine: "1.6L turbo", fuel: "petrol", notes: "بر پایه پژو ۳۰۱ / سیتروئن C-Elysée" },
      { name: "KJ (IKCO Cayenne)", years: "2023-present", segment: "suv", engine: "2.0L turbo", fuel: "petrol", notes: "مونتاژ پورشه کاین" },
      { name: "Haima S7 (IKCO)", years: "2014-2019", segment: "suv", engine: "2.0L", fuel: "petrol" },
      { name: "IKCO Dami pickup", years: "2022-present", segment: "pickup", engine: "1.5L", fuel: "petrol" },
    ],
  },
  {
    make: "Saipa",
    country: "ایران",
    assembler: "سایپا",
    founded: 1966,
    description: "دومین خودروساز ایران. تولیدکننده پراید، تیبا، شاهین و سریع.",
    models: [
      "Pride 131 (sedan)", "Pride 132 (hatchback)", "Pride Saba", "Pride 141 (liftback)",
      "Saba 5-door", "Quik", "Quik R", "Quik Automatic", "Tiba", "Tiba 2",
      "Shahin", "Shahin Plus", "Shahin 1.5L", "Shahin 1.6L", "Shahin Automatic",
      "Cerato", "Spectra", "Rio", "Cielo (concept)", "Saima 111 (concept)",
      "Saipa Pride 131 CNG", "Saipa 151 (Ziba)",
    ],
    catalog: [
      { name: "Pride 131 (sedan)", years: "1993-2021", segment: "sedan", engine: "1.3L Mazda B3", fuel: "petrol", notes: "بر پایه کیا پراید" },
      { name: "Pride 132 (hatchback)", years: "1993-2021", segment: "hatchback", engine: "1.3L B3", fuel: "petrol" },
      { name: "Pride Saba", years: "2001-2021", segment: "liftback", engine: "1.3L B3", fuel: "petrol" },
      { name: "Pride 141 (liftback)", years: "2003-2021", segment: "liftback", engine: "1.3L B3", fuel: "petrol" },
      { name: "Saba 5-door", years: "2001-2021", segment: "hatchback", engine: "1.3L B3", fuel: "petrol" },
      { name: "Quik", years: "2014-present", segment: "liftback", engine: "1.5L", fuel: "petrol", notes: "بر پایه پراید با طراحی جدید" },
      { name: "Quik R", years: "2017-present", segment: "liftback", engine: "1.5L", fuel: "petrol" },
      { name: "Quik Automatic", years: "2020-present", segment: "liftback", engine: "1.5L", fuel: "petrol" },
      { name: "Tiba", years: "2009-2020", segment: "hatchback", engine: "1.5L", fuel: "petrol", notes: "پلتفرم مستقل سایپا" },
      { name: "Tiba 2", years: "2015-2020", segment: "hatchback", engine: "1.5L", fuel: "petrol" },
      { name: "Shahin", years: "2020-present", segment: "sedan", engine: "1.5L", fuel: "petrol", notes: "بر پایه کیا ریو" },
      { name: "Shahin Plus", years: "2022-present", segment: "sedan", engine: "1.6L turbo", fuel: "petrol" },
      { name: "Shahin 1.5L", years: "2020-present", segment: "sedan", engine: "1.5L", fuel: "petrol" },
      { name: "Shahin 1.6L", years: "2021-present", segment: "sedan", engine: "1.6L", fuel: "petrol" },
      { name: "Shahin Automatic", years: "2022-present", segment: "sedan", engine: "1.6L", fuel: "petrol" },
      { name: "Cerato", years: "2018-present", segment: "sedan", engine: "1.6L", fuel: "petrol", notes: "مونتاژ کیا سراتو" },
      { name: "Spectra", years: "2004-2012", segment: "hatchback", engine: "1.6L", fuel: "petrol", notes: "مونتاژ کیا اسپکترا" },
      { name: "Rio", years: "2015-2019", segment: "sedan", engine: "1.6L", fuel: "petrol", notes: "مونتاژ کیا ریو" },
      { name: "Saipa Pride 131 CNG", years: "2008-2021", segment: "sedan", engine: "1.3L B3 / CNG", fuel: "cng" },
      { name: "Saipa 151 (Ziba)", years: "2020-present", segment: "liftback", engine: "1.5L", fuel: "petrol" },
    ],
  },
  {
    make: "Pars Khodro",
    country: "ایران",
    assembler: "پارس خودرو",
    founded: 1967,
    description: "مونتاژکننده رنو، نیسان و تندار ۹۰ (پلتفرم لوگان).",
    models: [
      "Renault L90 (Tondar 90)", "Tondar 90 Sedan", "Tondar 90 Plus", "Tondar 90 LX",
      "Renault Sandero", "Renault Sandero Stepway",
      "Nissan Patrol", "Nissan Patrol Safari", "Nissan Maxima", "Nissan Teana", "Nissan Sunny",
      "Pars Khodro 131 (Pride)", "Renault Megane (montage)",
    ],
    catalog: [
      { name: "Renault L90 (Tondar 90)", years: "2008-2020", segment: "sedan", engine: "1.6L K7M", fuel: "petrol", notes: "بر پایه رنو لوگان" },
      { name: "Tondar 90 Sedan", years: "2008-2020", segment: "sedan", engine: "1.6L K7M", fuel: "petrol" },
      { name: "Tondar 90 Plus", years: "2014-2020", segment: "sedan", engine: "1.6L K7M", fuel: "petrol" },
      { name: "Tondar 90 LX", years: "2008-2015", segment: "sedan", engine: "1.6L K7M", fuel: "petrol" },
      { name: "Renault Sandero", years: "2012-2018", segment: "hatchback", engine: "1.6L K7M", fuel: "petrol", notes: "مونتاژ رنو ساندرو" },
      { name: "Renault Sandero Stepway", years: "2014-2018", segment: "crossover", engine: "1.6L K7M", fuel: "petrol" },
      { name: "Nissan Patrol", years: "1998-2010", segment: "suv", engine: "4.5L / 4.8L", fuel: "petrol", notes: "مونتاژ نیسان پاترول" },
      { name: "Nissan Patrol Safari", years: "2001-2010", segment: "suv", engine: "4.8L", fuel: "petrol" },
      { name: "Nissan Maxima", years: "2000-2010", segment: "sedan", engine: "2.0L / 3.0L V6", fuel: "petrol" },
      { name: "Nissan Teana", years: "2008-2015", segment: "sedan", engine: "2.5L V6", fuel: "petrol" },
      { name: "Nissan Sunny", years: "2005-2012", segment: "sedan", engine: "1.5L", fuel: "petrol" },
      { name: "Pars Khodro 131 (Pride)", years: "1996-2001", segment: "sedan", engine: "1.3L B3", fuel: "petrol", notes: "تولید پراید پیش از انتقال به سایپا" },
      { name: "Renault Megane (montage)", years: "2004-2008", segment: "sedan", engine: "1.6L", fuel: "petrol" },
    ],
  },
  {
    make: "Bahman Motor",
    country: "ایران",
    assembler: "بهمن موتور (گروه بهمن)",
    founded: 1959,
    description: "مونتاژ مازدا، میتسوبیشی و ایسوزو.",
    models: [
      "Mazda 323", "Mazda 3", "Mazda 6", "Mazda Demio", "Mazda B2000",
      "Mitsubishi Pajero", "Mitsubishi L200", "Mitsubishi Galant",
      "Isuzu D-Max", "Foton View", "Foton Auman",
    ],
    catalog: [
      { name: "Mazda 323", years: "1992-2005", segment: "sedan", engine: "1.3L / 1.5L", fuel: "petrol", notes: "مونتاژ مازدا ۳۲۳" },
      { name: "Mazda 3", years: "2004-2018", segment: "sedan", engine: "1.6L / 2.0L", fuel: "petrol" },
      { name: "Mazda 6", years: "2008-2019", segment: "sedan", engine: "2.0L / 2.5L", fuel: "petrol" },
      { name: "Mazda Demio", years: "2003-2012", segment: "hatchback", engine: "1.3L / 1.5L", fuel: "petrol" },
      { name: "Mazda B2000", years: "1989-2005", segment: "pickup", engine: "2.0L", fuel: "petrol" },
      { name: "Mitsubishi Pajero", years: "1998-2018", segment: "suv", engine: "3.0L / 3.8L V6", fuel: "petrol" },
      { name: "Mitsubishi L200", years: "2005-2018", segment: "pickup", engine: "2.5L / 2.4L", fuel: "diesel" },
      { name: "Mitsubishi Galant", years: "2003-2012", segment: "sedan", engine: "2.4L", fuel: "petrol" },
      { name: "Isuzu D-Max", years: "2008-2018", segment: "pickup", engine: "2.5L diesel", fuel: "diesel" },
      { name: "Foton View", years: "2010-2018", segment: "van", engine: "2.8L diesel", fuel: "diesel" },
      { name: "Foton Auman", years: "2012-present", segment: "commercial", engine: "10L diesel", fuel: "diesel" },
    ],
  },
  {
    make: "Kerman Motor (KMC)",
    country: "ایران",
    assembler: "کرمان موتور",
    founded: 1996,
    description: "مونتاژ هیوندای، چری و جی‌ای‌سی.",
    models: [
      "Hyundai Elantra", "Hyundai Accent", "Hyundai Tucson", "Hyundai i10", "Hyundai i20",
      "Hyundai i30", "Chery Arrizo 5", "Chery Arrizo 6", "Chery Arrizo 8",
      "Chery Tiggo 5", "Chery Tiggo 7", "Chery Tiggo 8",
      "JAC S3", "JAC S4", "JAC S5", "JAC J7", "JAC X7 Plus",
      "FAW Besturn B70", "FAW Oley",
    ],
    catalog: [
      { name: "Hyundai Elantra", years: "2010-2019", segment: "sedan", engine: "1.6L / 2.0L", fuel: "petrol", notes: "مونتاژ هیوندای النترا" },
      { name: "Hyundai Accent", years: "2008-2018", segment: "sedan", engine: "1.4L / 1.6L", fuel: "petrol" },
      { name: "Hyundai Tucson", years: "2012-2018", segment: "suv", engine: "2.0L", fuel: "petrol" },
      { name: "Hyundai i10", years: "2012-2018", segment: "hatchback", engine: "1.0L / 1.2L", fuel: "petrol" },
      { name: "Hyundai i20", years: "2012-2018", segment: "hatchback", engine: "1.4L / 1.6L", fuel: "petrol" },
      { name: "Hyundai i30", years: "2014-2018", segment: "hatchback", engine: "1.6L", fuel: "petrol" },
      { name: "Chery Arrizo 5", years: "2018-present", segment: "sedan", engine: "1.5L", fuel: "petrol" },
      { name: "Chery Arrizo 6", years: "2020-present", segment: "sedan", engine: "1.5L turbo", fuel: "petrol" },
      { name: "Chery Arrizo 8", years: "2022-present", segment: "sedan", engine: "1.6L turbo", fuel: "petrol" },
      { name: "Chery Tiggo 5", years: "2017-present", segment: "suv", engine: "1.5L turbo", fuel: "petrol" },
      { name: "Chery Tiggo 7", years: "2019-present", segment: "suv", engine: "1.5L / 1.6L turbo", fuel: "petrol" },
      { name: "Chery Tiggo 8", years: "2020-present", segment: "suv", engine: "1.6L turbo", fuel: "petrol" },
      { name: "JAC S3", years: "2017-present", segment: "suv", engine: "1.5L / 1.6L", fuel: "petrol" },
      { name: "JAC S4", years: "2019-present", segment: "crossover", engine: "1.5L turbo", fuel: "petrol" },
      { name: "JAC S5", years: "2016-present", segment: "suv", engine: "2.0L turbo", fuel: "petrol" },
      { name: "JAC J7", years: "2020-present", segment: "hatchback", engine: "1.5L turbo", fuel: "petrol" },
      { name: "JAC X7 Plus", years: "2022-present", segment: "suv", engine: "1.5L turbo", fuel: "petrol" },
      { name: "FAW Besturn B70", years: "2019-present", segment: "sedan", engine: "1.5L turbo", fuel: "petrol" },
      { name: "FAW Oley", years: "2021-present", segment: "sedan", engine: "1.4L", fuel: "petrol" },
    ],
  },
  {
    make: "Arian Khodro",
    country: "ایران",
    assembler: "آریان خودرو",
    founded: 2000,
    description: "مونتاژ آریا و شهاب خودرو (پلتفرم ال۹۰).",
    models: ["Aria", "Aria 2", "Shahab Khodro 4-door pickup", "Shahab Khodro 2-door pickup"],
    catalog: [
      { name: "Aria", years: "2014-present", segment: "sedan", engine: "1.6L K7M", fuel: "petrol", notes: "بر پایه پلتفرم تندار ۹۰" },
      { name: "Aria 2", years: "2018-present", segment: "sedan", engine: "1.6L K7M", fuel: "petrol" },
      { name: "Shahab Khodro 4-door pickup", years: "2014-present", segment: "pickup", engine: "1.6L K7M", fuel: "petrol" },
      { name: "Shahab Khodro 2-door pickup", years: "2014-present", segment: "pickup", engine: "1.6L K7M", fuel: "petrol" },
    ],
  },
  {
    make: "Modiran Khodro",
    country: "ایران",
    assembler: "مدیران خودرو",
    founded: 2003,
    description: "مونتاژ مازدا و واردکننده محصولات مازدا.",
    models: ["Mazda 3 (montage)", "Mazda 6 (montage)", "Mazda CX-5 (import)", "Mazda CX-30 (import)"],
    catalog: [
      { name: "Mazda 3 (montage)", years: "2008-2018", segment: "sedan", engine: "1.6L / 2.0L", fuel: "petrol", notes: "مونتاژ مدیران خودرو" },
      { name: "Mazda 6 (montage)", years: "2010-2019", segment: "sedan", engine: "2.0L / 2.5L", fuel: "petrol" },
      { name: "Mazda CX-5 (import)", years: "2018-present", segment: "suv", engine: "2.0L / 2.5L", fuel: "petrol" },
      { name: "Mazda CX-30 (import)", years: "2021-present", segment: "crossover", engine: "2.0L", fuel: "petrol" },
    ],
  },
  {
    make: "Diba Motor",
    country: "ایران",
    assembler: "دیبا موتور",
    founded: 2017,
    description: "تولید خودروی ملی کوچک (Diba M1/M2) با موتور پژو.",
    models: ["Diba M1", "Diba M2", "Diba T8"],
    catalog: [
      { name: "Diba M1", years: "2019-present", segment: "sedan", engine: "1.6L EC5 (Peugeot)", fuel: "petrol", notes: "خودروی ملی کوچک" },
      { name: "Diba M2", years: "2021-present", segment: "sedan", engine: "1.6L EC5", fuel: "petrol" },
      { name: "Diba T8", years: "2020-present", segment: "hatchback", engine: "1.6L EC5", fuel: "petrol" },
    ],
  },
  {
    make: "Kourosh Motor (K1)",
    country: "ایران",
    assembler: "کوروش موتور (K1)",
    founded: 2018,
    description: "تولید‌کننده خودروی الکتریکی ایرانی (K1 EV، Olia EV).",
    models: ["K1 EV", "Olia EV"],
    catalog: [
      { name: "K1 EV", years: "2021-present", segment: "ev", engine: "100 kW electric", fuel: "ev", notes: "اولین EV تولیدی ایران" },
      { name: "Olia EV", years: "2023-present", segment: "ev", engine: "120 kW electric", fuel: "ev" },
    ],
  },
  {
    make: "Apex Motor",
    country: "ایران",
    assembler: "آپکس موتور",
    founded: 2019,
    description: "تولید خودروی الکتریکی (Nara) به‌صورت مشارکتی با ایران خودرو.",
    models: ["Nara EV", "Soren EV (IKCO joint)"],
    catalog: [
      { name: "Nara EV", years: "2022-present", segment: "ev", engine: "80 kW electric", fuel: "ev" },
      { name: "Soren EV (IKCO joint)", years: "2023-present", segment: "ev", engine: "100 kW electric", fuel: "ev", notes: "نسخه الکتریکی سمند سورن" },
    ],
  },
  {
    make: "Morattab Motor",
    country: "ایران",
    assembler: "مراتب موتور",
    founded: 1990,
    description: "مونتاژ موراتب K2 (شبیه سوزوکی ویتارا).",
    models: ["Morattab K2"],
    catalog: [
      { name: "Morattab K2", years: "2005-2015", segment: "suv", engine: "1.6L / 2.0L", fuel: "petrol", notes: "کپی سوزوکی ویتارا" },
    ],
  },
  {
    make: "Rakhsh Khodro Diesel (RKD)",
    country: "ایران",
    assembler: "رخش خودرو دیزل",
    founded: 1996,
    description: "تولید خودروهای صنعتی و وانت‌های کوچک.",
    models: ["RKD Pickup", "RKD Mini Truck"],
    catalog: [
      { name: "RKD Pickup", years: "2005-present", segment: "pickup", engine: "2.0L", fuel: "petrol" },
      { name: "RKD Mini Truck", years: "2008-present", segment: "commercial", engine: "1.6L", fuel: "petrol" },
    ],
  },
  {
    make: "Hepco",
    country: "ایران",
    assembler: "هپکو (Arak Heavy Equipment)",
    founded: 1974,
    description: "تولید ماشین‌آلات سنگین و کامیون‌های سبک (Niroo N711).",
    models: ["Hepco Niroo N711", "Hepco Mini Truck"],
    catalog: [
      { name: "Hepco Niroo N711", years: "2015-present", segment: "commercial", engine: "2.0L diesel", fuel: "diesel", notes: "مینی‌کامیون بومی هپکو" },
      { name: "Hepco Mini Truck", years: "2018-present", segment: "commercial", engine: "2.0L diesel", fuel: "diesel" },
    ],
  },
  {
    make: "Setareh Iran",
    country: "ایران",
    assembler: "ستاره ایران",
    founded: 2001,
    description: "مونتاژ دانگ‌فنگ و جی‌ای‌سی در ایران.",
    models: ["Dongfeng S30", "Dongfeng H30 Cross", "Dongfeng AX7", "JAC J5 (montage)", "JAC Refine"],
    catalog: [
      { name: "Dongfeng S30", years: "2012-2018", segment: "sedan", engine: "1.6L", fuel: "petrol", notes: "مونتاژ دانگ‌فنگ S30" },
      { name: "Dongfeng H30 Cross", years: "2014-2018", segment: "crossover", engine: "1.6L", fuel: "petrol" },
      { name: "Dongfeng AX7", years: "2018-2022", segment: "suv", engine: "2.0L", fuel: "petrol" },
      { name: "JAC J5 (montage)", years: "2010-2016", segment: "sedan", engine: "1.6L / 2.0L", fuel: "petrol" },
      { name: "JAC Refine", years: "2014-2018", segment: "van", engine: "2.0L", fuel: "petrol" },
    ],
  },
  {
    make: "Sazeh Gostar Sahand (Diapars)",
    country: "ایران",
    assembler: "سازه گستر ساحل (دیاپارس)",
    founded: 1998,
    description: "مونتاژ مینی‌تراک‌ها و وانت‌های دانگ‌فنگ.",
    models: ["Diapars Dongfeng Mini Pickup", "Diapars Captain", "Diapars Rich"],
    catalog: [
      { name: "Diapars Dongfeng Mini Pickup", years: "2010-present", segment: "pickup", engine: "1.5L", fuel: "petrol", notes: "مینی‌وانت دانگ‌فنگ" },
      { name: "Diapars Captain", years: "2018-present", segment: "pickup", engine: "2.4L", fuel: "petrol" },
      { name: "Diapars Rich", years: "2020-present", segment: "pickup", engine: "2.4L", fuel: "petrol" },
    ],
  },
  {
    make: "Ray Khodro",
    country: "ایران",
    assembler: "رای خودرو",
    founded: 2008,
    description: "واردکننده MG و سایر برندهای چینی.",
    models: ["MG3", "MG5", "MG6", "MG ZS", "MG HS"],
    catalog: [
      { name: "MG3", years: "2018-present", segment: "hatchback", engine: "1.5L", fuel: "petrol", notes: "واردات توسط رای خودرو" },
      { name: "MG5", years: "2020-present", segment: "sedan", engine: "1.5L turbo", fuel: "petrol" },
      { name: "MG6", years: "2019-present", segment: "sedan", engine: "1.5L turbo", fuel: "petrol" },
      { name: "MG ZS", years: "2019-present", segment: "suv", engine: "1.5L", fuel: "petrol" },
      { name: "MG HS", years: "2020-present", segment: "suv", engine: "1.5L turbo", fuel: "petrol" },
    ],
  },
  {
    make: "Sahand Motor",
    country: "ایران",
    assembler: "ساحل موتور",
    founded: 2010,
    description: "واردکننده برندهای چینی مختلف.",
    models: ["Changan Alsvin", "Changan Eado", "Changan CS35 Plus", "Changan CS55", "Changan CS75 Plus"],
    catalog: [
      { name: "Changan Alsvin", years: "2020-present", segment: "sedan", engine: "1.4L / 1.5L", fuel: "petrol" },
      { name: "Changan Eado", years: "2019-present", segment: "sedan", engine: "1.6L", fuel: "petrol" },
      { name: "Changan CS35 Plus", years: "2020-present", segment: "suv", engine: "1.4L turbo", fuel: "petrol" },
      { name: "Changan CS55", years: "2020-present", segment: "suv", engine: "1.5L turbo", fuel: "petrol" },
      { name: "Changan CS75 Plus", years: "2021-present", segment: "suv", engine: "2.0L turbo", fuel: "petrol" },
    ],
  },
  {
    make: "Bonag Nechin Sahand",
    country: "ایران",
    assembler: "بناگ نچین ساحل",
    founded: 2014,
    description: "مونتاژ کامیون‌های سبک دانگ‌فنگ و JAC.",
    models: ["Bonag Captain", "Bonag Rich", "Bonag T1"],
    catalog: [
      { name: "Bonag Captain", years: "2018-present", segment: "pickup", engine: "2.4L", fuel: "petrol" },
      { name: "Bonag Rich", years: "2020-present", segment: "pickup", engine: "2.4L", fuel: "petrol" },
      { name: "Bonag T1", years: "2022-present", segment: "pickup", engine: "2.0L turbo", fuel: "petrol" },
    ],
  },
  {
    make: "Zagross Khodro",
    country: "ایران",
    assembler: "زاگرس خودرو",
    founded: 1995,
    description: "مونتاز مرسدس بنز و کامیون‌های سبک.",
    models: ["Mercedes-Benz C-Class (montage)", "Mercedes-Benz E-Class (montage)"],
    catalog: [
      { name: "Mercedes-Benz C-Class (montage)", years: "2001-2008", segment: "sedan", engine: "1.8L / 2.0L Kompressor", fuel: "petrol", notes: "مونتاژ زاگرس خودرو" },
      { name: "Mercedes-Benz E-Class (montage)", years: "2001-2008", segment: "sedan", engine: "2.6L / 3.2L", fuel: "petrol" },
    ],
  },
  {
    make: "Montaj Khodro-e-Tabriz (MTA)",
    country: "ایران",
    assembler: "مونتاژ خودرو تبریز",
    founded: 1996,
    description: "مونتاژ گسترده‌ی محصولات چینی (پراید، بیستون، دانگ‌فنگ).",
    models: ["Peugeot 405 (montage)", "Pride 131 (montage)", "Runna (montage)"],
    catalog: [
      { name: "Peugeot 405 (montage)", years: "2003-2020", segment: "sedan", engine: "1.8L XU7", fuel: "petrol" },
      { name: "Pride 131 (montage)", years: "2003-2021", segment: "sedan", engine: "1.3L B3", fuel: "petrol" },
      { name: "Runna (montage)", years: "2015-2020", segment: "sedan", engine: "1.4L TU3", fuel: "petrol" },
    ],
  },

  // ═══════════ Chinese Brands (common imports/montage in Iran) ═══════════
  {
    make: "Chery",
    country: "چین",
    models: ["Tiggo 5", "Tiggo 7", "Tiggo 8", "Arrizo 5", "Arrizo 6", "Arrizo 8", "E3", "E5"],
  },
  {
    make: "Haval",
    country: "چین",
    models: ["Jolion", "Jolion Pro", "H6", "H6 GT", "H9"],
  },
  {
    make: "Geely",
    country: "چین",
    models: ["Emgrand 7", "Emgrand X7", "Coolray", "Tugella", "Atlas"],
  },
  {
    make: "BYD",
    country: "چین",
    models: ["F3", "Song Plus", "Han EV", "Atto 3", "Dolphin"],
  },
  {
    make: "Changan",
    country: "چین",
    models: ["CS35 Plus", "CS55", "CS75 Plus", "CS95", "Eado", "Alsvin"],
  },
  {
    make: "JAC",
    country: "چین",
    models: ["S3", "S4", "S5", "J7", "X7 Plus", "e-J7 (EV)"],
  },
  {
    make: "Dongfeng",
    country: "چین",
    models: ["SX5", "EX1", "T5 EVO", "Captain", "Rich"],
  },
  {
    make: "Bestune",
    country: "چین",
    models: ["T77", "T99", "B70", "NAT"],
  },

  // ═══════════ European ═══════════
  {
    make: "Peugeot",
    country: "فرانسه",
    models: ["206", "207", "208", "301", "308", "405", "406", "407", "508", "2008", "3008", "5008"],
  },
  {
    make: "Renault",
    country: "فرانسه",
    models: ["Clio", "Megane", "Fluence", "Talisman", "Sandero", "Duster", "Captur", "Koleos", "L90 (Tondar)"],
  },
  {
    make: "Citroën",
    country: "فرانسه",
    models: ["C3", "C4", "C5", "C-Elysée", "Berlingo"],
  },
  {
    make: "Fiat",
    country: "ایتالیا",
    models: ["500", "Punto", "Tipo", "Panda", "Doblo"],
  },
  {
    make: "Volkswagen",
    country: "آلمان",
    models: ["Golf", "Polo", "Passat", "Tiguan", "Touareg", "Arteon", "Golf GTI"],
  },
  {
    make: "BMW",
    country: "آلمان",
    models: ["118i", "320i", "330i", "520i", "530i", "730Li", "X1", "X3", "X5", "X6"],
  },
  {
    make: "Mercedes-Benz",
    country: "آلمان",
    models: ["A180", "A200", "C180", "C200", "C300", "E200", "E300", "S500", "GLA200", "GLC300", "GLE350", "GLS450"],
  },
  {
    make: "Audi",
    country: "آلمان",
    models: ["A3", "A4", "A6", "A8", "Q3", "Q5", "Q7", "Q8"],
  },
  {
    make: "Porsche",
    country: "آلمان",
    models: ["911", "Cayenne", "Macan", "Panamera", "Taycan"],
  },
  {
    make: "Volvo",
    country: "سوئد",
    models: ["S60", "S90", "XC40", "XC60", "XC90"],
  },
  {
    make: "Skoda",
    country: "چک",
    models: ["Octavia", "Fabia", "Superb", "Kodiaq", "Karoq"],
  },

  // ═══════════ Asian ═══════════
  {
    make: "Toyota",
    country: "ژاپن",
    models: ["Corolla", "Camry", "Yaris", "Corolla Cross", "RAV4", "Highlander", "Land Cruiser", "Prado", "Hilux", "Prius", "C-HR"],
  },
  {
    make: "Honda",
    country: "ژاپن",
    models: ["Civic", "Accord", "City", "CR-V", "HR-V", "Pilot"],
  },
  {
    make: "Hyundai",
    country: "کره جنوبی",
    models: ["Elantra", "Sonata", "Accent", "i10", "i20", "i30", "Tucson", "Santa Fe", "Creta", "Casper", "Palisade"],
  },
  {
    make: "Kia",
    country: "کره جنوبی",
    models: ["Cerato", "Optima", "Picanto", "Rio", "Sportage", "Sorento", "Carnival", "Seltos", "Stonic"],
  },
  {
    make: "Nissan",
    country: "ژاپن",
    models: ["Maxima", "Teana", "Altima", "Patrol", "Juke", "Qashqai", "X-Trail", "Pathfinder"],
  },
  {
    make: "Mazda",
    country: "ژاپن",
    models: ["3", "6", "CX-3", "CX-5", "CX-9", "323", "B2000"],
  },
  {
    make: "Mitsubishi",
    country: "ژاپن",
    models: ["Lancer", "Pajero", "Outlander", "ASX", "L200"],
  },
  {
    make: "Subaru",
    country: "ژاپن",
    models: ["Impreza", "Forester", "Outback", "XV", "Legacy"],
  },
  {
    make: "Lexus",
    country: "ژاپن",
    models: ["IS200", "ES300", "RX350", "LX570", "GX460", "NX300"],
  },

  // ═══════════ American ═══════════
  {
    make: "Chevrolet",
    country: "آمریکا",
    models: ["Cruze", "Malibu", "Tahoe", "Equinox", "Spark", "Camaro"],
  },
  {
    make: "Ford",
    country: "آمریکا",
    models: ["Fiesta", "Focus", "Fusion", "Escape", "Explorer", "Mustang", "Ranger"],
  },

  // ═══════════ British ═══════════
  {
    make: "Land Rover",
    country: "انگلیس",
    models: ["Range Rover", "Range Rover Sport", "Discovery", "Defender", "Evoque", "Velar"],
  },
  {
    make: "Jaguar",
    country: "انگلیس",
    models: ["XE", "XF", "F-Pace", "E-Pace", "I-Pace"],
  },
];

// ─── Heavy Machinery & Commercial (ماشین‌آلات سنگین) ───
export const HEAVY_MAKES: VehicleMake[] = [
  // Trucks
  { make: "Volvo Trucks", country: "سوئد", models: ["FH16", "FH", "FM", "FMX", "FE", "FL"] },
  { make: "Scania", country: "سوئد", models: ["R450", "R500", "S500", "S650", "P360", "G410", "P280"] },
  { make: "Mercedes-Benz Trucks", country: "آلمان", models: ["Actros", "Arocs", "Atego", "Antos", "Econic"] },
  { make: "MAN", country: "آلمان", models: ["TGX", "TGS", "TGL", "TGM"] },
  { make: "DAF", country: "هلند", models: ["XF", "XG", "CF", "LF"] },
  { make: "Iveco", country: "ایتالیا", models: ["S-Way", "X-Way", "T-Way", "Daily", "Stralis"] },
  { make: "Renault Trucks", country: "فرانسه", models: ["T High", "T", "K", "C", "D"] },
  {
    make: "Iran Khodro Diesel",
    country: "ایران",
    assembler: "ایران خودرو دیزل",
    founded: 1963,
    description: "مونتاژ کامیون‌های ایتال‌ایرکو، فاو، دانگ‌فنگ و ساینوتروک.",
    models: ["IVECO Stralis", "FAW J6", "Dongfeng KL", "SINOTRUK Howo", "Shacman X3000"],
  },
  { make: "SINOTRUK", country: "چین", models: ["Howo 380", "Howo 420", "Howo 440", "T7H", "T5G"] },
  { make: "FAW", country: "چین", models: ["J6", "J5", "J7", "Xiali"] },
  { make: "Dongfeng", country: "چین", models: ["KL", "KR", "KC", "T-Lift"] },
  { make: "Shacman", country: "چین", models: ["X3000", "F3000", "M3000", "H3000"] },
  { make: "Foton", country: "چین", models: ["Auman", "Aumark", "View", "Ollin"] },
  { make: "JAC Trucks", country: "چین", models: ["N-Series", "K-Series", "H-Series"] },

  // Buses
  { make: "Mercedes-Benz Buses", country: "آلمان", models: ["O 530 Citaro", "O 350", "O 500", "Tourismo", "Travego"] },
  { make: "Volvo Buses", country: "سوئد", models: ["B11R", "B8R", "B9R", "7900", "9700"] },
  { make: "Setra", country: "آلمان", models: ["S 415", "S 416", "S 516", "S 531 DT"] },
  {
    make: "Iran Khodro Bus",
    country: "ایران",
    assembler: "ایران خودرو (اتوبوس)",
    description: "مونتاژ اتوبوس‌های بنز، ایتال و ستاره.",
    models: ["O 457", "Setra S 415", "IVECO Eucity", "Iran Khodro City Bus"],
  },
  { make: "IVECO Bus", country: "ایتالیا", models: ["Eucity", "Evadys", "Crossway", "Daily minibus"] },
  {
    make: "TECNOBUS",
    country: "ایران",
    assembler: "تکنوبوس",
    description: "مونتاژ مینی‌بوس‌های استارکس و اسپرینتر.",
    models: ["Starex minibus", "Sprinter minibus"],
  },

  // Construction equipment
  { make: "Caterpillar", country: "آمریکا", models: ["320 Excavator", "336 Excavator", "390 Excavator", "966 Wheel Loader", "980 Wheel Loader", "14M Grader", "140K Grader", "D6 Bulldozer", "D8 Bulldozer", "D10 Bulldozer"] },
  { make: "Komatsu", country: "ژاپن", models: ["PC200 Excavator", "PC300 Excavator", "PC400 Excavator", "PC800 Excavator", "WA380 Loader", "WA470 Loader", "WA600 Loader", "D65 Bulldozer", "D85 Bulldozer", "GD655 Grader"] },
  { make: "Hitachi", country: "ژاپن", models: ["ZX200 Excavator", "ZX350 Excavator", "ZX490 Excavator", "ZX870 Excavator", "ZW310 Loader", "ZW370 Loader"] },
  { make: "Liebherr", country: "آلمان", models: ["R 926 Excavator", "R 956 Excavator", "R 976 Excavator", "L 566 Loader", "L 586 Loader", "PR 736 Bulldozer", "PR 756 Bulldozer"] },
  { make: "Volvo CE", country: "سوئد", models: ["EC220 Excavator", "EC380 Excavator", "EC480 Excavator", "EC750 Excavator", "L120H Loader", "L150H Loader", "L180H Loader", "G946 Grader"] },
  { make: "JCB", country: "انگلیس", models: ["JS220 Excavator", "JS370 Excavator", "3CX Backhoe", "4CX Backhoe", "457 Wheel Loader", "Robot 190"] },
  { make: "Doosan", country: "کره جنوبی", models: ["DX225 Excavator", "DX380 Excavator", "DX490 Excavator", "M101 Wheel Loader", "M121 Wheel Loader"] },
  { make: "Hyundai CE", country: "کره جنوبی", models: ["R220 Excavator", "R300 Excavator", "R380 Excavator", "HL760 Loader", "HL757 Loader"] },
  { make: "SANY", country: "چین", models: ["SY215 Excavator", "SY335 Excavator", "SY365 Excavator", "SY550 Excavator", "SYL956 Loader", "SYL953 Loader"] },
  { make: "XCMG", country: "چین", models: ["XE215 Excavator", "XE335 Excavator", "XE490 Excavator", "LW500K Loader", "LW600K Loader", "GR180 Grader", "GR215 Grader"] },
  { make: "LiuGong", country: "چین", models: ["CLG922E Excavator", "CLG936E Excavator", "CLG855N Loader", "CLG856H Loader"] },
  { make: "Case CE", country: "آمریکا", models: ["CX210 Excavator", "CX290 Excavator", "621G Loader", "721G Loader"] },
  { make: "New Holland", country: "ایتالیا", models: ["E215B Excavator", "E245B Excavator", "W230B Loader", "W270B Loader"] },
  { make: "Bobcat", country: "آمریکا", models: ["E35 Excavator", "E50 Excavator", "S650 Skid Steer", "S850 Skid Steer"] },

  // Iranian heavy equipment
  {
    make: "Hepco Industrial",
    country: "ایران",
    assembler: "هپکو (آراک)",
    founded: 1974,
    description: "بزرگ‌ترین تولیدکننده ماشین‌آلات سنگین ایران.",
    models: ["Hepco Excavator HE-220", "Hepco Loader HL-180", "Hepco Bulldozer HD-200"],
  },
  { make: "Tabriz Tractor", country: "ایران", assembler: "تراکتورسازی تبریز", founded: 1966, description: "تولید تراکتور کشاورزی.", models: ["MF-285", "MF-399", "MF-240", "Tabriz 6500"] },

  // Agriculture
  { make: "John Deere", country: "آمریکا", models: ["5075M Tractor", "6155M Tractor", "6215R Tractor", "8360R Tractor", "W210 Combine", "S660 Combine"] },
  { make: "Massey Ferguson", country: "آمریکا", models: ["MF-240 Tractor", "MF-285 Tractor", "MF-385 Tractor", "MF-399 Tractor", "MF-5445 Tractor"] },
  { make: "New Holland Agriculture", country: "ایتالیا", models: ["T7.270 Tractor", "TD5.90 Tractor", "CR8.90 Combine", "CX8.80 Combine"] },

  // Generators
  { make: "Caterpillar Generator", country: "آمریکا", models: ["C9 Generator", "C18 Generator", "C32 Generator", "3512 Generator", "3516 Generator"] },
];

// ──────────── Helpers ────────────

// Get makes for a given mode
export function getMakesForMode(mode: "passenger" | "heavy"): VehicleMake[] {
  return mode === "passenger" ? PASSENGER_MAKES : HEAVY_MAKES;
}

// Get only Iranian assemblers/importers (for the catalog page)
export function getIranianMakes(mode: "passenger" | "heavy" = "passenger"): VehicleMake[] {
  return getMakesForMode(mode).filter((m) => m.country === "ایران" && !!m.assembler);
}

// Get the rich catalog entry for a specific make+model
export function getModelMeta(make: string, modelName: string): VehicleModel | undefined {
  const makeObj = PASSENGER_MAKES.find((m) => m.make === make) || HEAVY_MAKES.find((m) => m.make === make);
  return makeObj?.catalog?.find((c) => c.name === modelName);
}

// Segment label (fa/en) for display
export const SEGMENT_LABELS: Record<VehicleSegment, { fa: string; en: string }> = {
  sedan: { fa: "سدان", en: "Sedan" },
  hatchback: { fa: "هاچ‌بک", en: "Hatchback" },
  liftback: { fa: "لیفت‌بک", en: "Liftback" },
  suv: { fa: "شاسی‌بلند", en: "SUV" },
  crossover: { fa: "کراس‌اوور", en: "Crossover" },
  pickup: { fa: "وانت", en: "Pickup" },
  van: { fa: "ون", en: "Van" },
  minibus: { fa: "مینی‌بوس", en: "Minibus" },
  coupe: { fa: "کوپه", en: "Coupe" },
  ev: { fa: "الکتریکی", en: "EV" },
  commercial: { fa: "تجاری", en: "Commercial" },
};

// Fuel label (fa/en)
export const FUEL_LABELS: Record<VehicleFuel, { fa: string; en: string }> = {
  petrol: { fa: "بنزینی", en: "Petrol" },
  diesel: { fa: "دیزلی", en: "Diesel" },
  hybrid: { fa: "هایبرید", en: "Hybrid" },
  ev: { fa: "الکتریکی", en: "Electric" },
  cng: { fa: "دوگانه‌سوز CNG", en: "CNG" },
  lpg: { fa: "گاز مایع LPG", en: "LPG" },
};
