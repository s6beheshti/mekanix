// MEKANIX — Iranian vehicle database
// Comprehensive make→model catalog for the Iranian market.
// Includes Iranian-assembled (montaژi) brands + common imports.

export interface VehicleMake {
  make: string;
  country: string;
  models: string[];
}

// ─── Passenger Vehicles (خودروی سواری) ───
export const PASSENGER_MAKES: VehicleMake[] = [
  // Iranian manufacturers / assemblers
  { make: "Arian Khodro", country: "ایران", models: ["Aria", "Shahab Khodro"] },
  { make: "Pars Khodro", country: "ایران", models: ["Nissan Patrol", "Nissan Maxima", "Nissan Teana", "Renault L90 (Tondar 90)", "Tondar 90 Plus", "Tondar 90 Sedan"] },

  // Chinese brands (very common in Iran)
  { make: "Chery", country: "چین", models: ["Tiggo 5", "Tiggo 7", "Tiggo 8", "Arrizo 5", "Arrizo 6", "Arrizo 8", "E3", "E5"] },
  { make: "Haval", country: "چین", models: ["Jolion", "Jolion Pro", "H6", "H6 GT", "H9"] },
  { make: "Geely", country: "چین", models: ["Emgrand 7", "Emgrand X7", "Coolray", "Tugella", "Atlas"] },
  { make: "BYD", country: "چین", models: ["F3", "Song Plus", "Han EV", "Atto 3", "Dolphin"] },
  { make: "Changan", country: "چین", models: ["CS35 Plus", "CS55", "CS75 Plus", "CS95", "Eado", "Alsvin"] },
  { make: "JAC", country: "چین", models: ["S3", "S4", "S5", "J7", "X7 Plus", "e-J7 (EV)"] },
  { make: "MG", country: "چین", models: ["MG3", "MG5", "MG6", "MG ZS", "MG RX5", "MG HS", "MG GT"] },
  { make: "Dongfeng", country: "چین", models: ["SX5", "EX1", "T5 EVO"] },
  { make: "Bestune", country: "چین", models: ["T77", "T99", "B70", "NAT"] },

  // European
  { make: "Peugeot", country: "فرانسه", models: ["206", "207", "208", "301", "308", "405", "406", "407", "508", "2008", "3008", "5008"] },
  { make: "Renault", country: "فرانسه", models: ["Clio", "Megane", "Fluence", "Talisman", "Sandero", "Duster", "Captur", "Koleos", "L90 (Tondar)"] },
  { make: "Citroën", country: "فرانسه", models: ["C3", "C4", "C5", "C-Elysée", "Berlingo"] },
  { make: "Fiat", country: "ایتالیا", models: ["500", "Punto", "Tipo", "Panda", "Doblo"] },
  { make: "Volkswagen", country: "آلمان", models: ["Golf", "Polo", "Passat", "Tiguan", "Touareg", "Arteon", "Golf GTI"] },
  { make: "BMW", country: "آلمان", models: ["118i", "320i", "330i", "520i", "530i", "730Li", "X1", "X3", "X5", "X6"] },
  { make: "Mercedes-Benz", country: "آلمان", models: ["A180", "A200", "C180", "C200", "C300", "E200", "E300", "S500", "GLA200", "GLC300", "GLE350", "GLS450"] },
  { make: "Audi", country: "آلمان", models: ["A3", "A4", "A6", "A8", "Q3", "Q5", "Q7", "Q8"] },
  { make: "Porsche", country: "آلمان", models: ["911", "Cayenne", "Macan", "Panamera", "Taycan"] },
  { make: "Volvo", country: "سوئد", models: ["S60", "S90", "XC40", "XC60", "XC90"] },
  { make: "Skoda", country: "چک", models: ["Octavia", "Fabia", "Superb", "Kodiaq", "Karoq"] },

  // Asian
  { make: "Toyota", country: "ژاپن", models: ["Corolla", "Camry", "Yaris", "Corolla Cross", "RAV4", "Highlander", "Land Cruiser", "Prado", "Hilux", "Prius", "C-HR"] },
  { make: "Honda", country: "ژاپن", models: ["Civic", "Accord", "City", "CR-V", "HR-V", "Pilot"] },
  { make: "Hyundai", country: "کره جنوبی", models: ["Elantra", "Sonata", "Accent", "i10", "i20", "i30", "Tucson", "Santa Fe", "Creta", "Casper", "Palisade"] },
  { make: "Kia", country: "کره جنوبی", models: ["Cerato", "Optima", "Picanto", "Rio", "Sportage", "Sorento", "Carnival", "Seltos", "Stonic"] },
  { make: "Nissan", country: "ژاپن", models: ["Maxima", "Teana", "Altima", "Patrol", "Juke", "Qashqai", "X-Trail", "Pathfinder"] },
  { make: "Mazda", country: "ژاپن", models: ["3", "6", "CX-3", "CX-5", "CX-9", "323", "B2000"] },
  { make: "Mitsubishi", country: "ژاپن", models: ["Lancer", "Pajero", "Outlander", "ASX", "L200"] },
  { make: "Subaru", country: "ژاپن", models: ["Impreza", "Forester", "Outback", "XV", "Legacy"] },
  { make: "Lexus", country: "ژاپن", models: ["IS200", "ES300", "RX350", "LX570", "GX460", "NX300"] },

  // American
  { make: "Chevrolet", country: "آمریکا", models: ["Cruze", "Malibu", "Tahoe", "Equinox", "Spark", "Camaro"] },
  { make: "Ford", country: "آمریکا", models: ["Fiesta", "Focus", "Fusion", "Escape", "Explorer", "Mustang", "Ranger"] },

  // British
  { make: "Land Rover", country: "انگلیس", models: ["Range Rover", "Range Rover Sport", "Discovery", "Defender", "Evoque", "Velar"] },
  { make: "Jaguar", country: "انگلیس", models: ["XE", "XF", "F-Pace", "E-Pace", "I-Pace"] },

  // Iranian EV
  { make: "Kourosh Motor", country: "ایران", models: ["K1 EV", "Olia EV"] },
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
  { make: "Iran Khodro Diesel", country: "ایران", models: ["IVECO Stralis", "FAW J6", "Dongfeng", "SINOTRUK Howo"] },
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
  { make: "Iran Khodro Bus", country: "ایران", models: ["O 457", "Setra S 415", "IVECO Eucity"] },
  { make: "IVECO Bus", country: "ایتالیا", models: ["Eucity", "Evadys", "Crossway", "Daily minibus"] },
  { make: "TECNOBUS", country: "ایران", models: ["Starex minibus", "Sprinter minibus"] },

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
  { make: "LiuGong", country: "چین", models: ["CLG922 Excavator", "CLG936 Excavator", "CLG855 Loader", "CLG856 Loader", "CLG950E Excavator"] },
  { make: "Shantui", country: "چین", models: ["SD16 Bulldozer", "SD22 Bulldozer", "SD32 Bulldozer", "DH17 Bulldozer"] },

  // Agricultural
  { make: "John Deere", country: "آمریکا", models: ["5050D Tractor", "5075E Tractor", "6105B Tractor", "6155M Tractor", "6215R Tractor", "8285R Tractor", "W210 Combine", "W235 Combine", "S780 Combine"] },
  { make: "Massey Ferguson", country: "انگلیس", models: ["MF 240 Tractor", "MF 265 Tractor", "MF 290 Tractor", "MF 385 Tractor", "MF 5445 Tractor", "MF 5610 Tractor", "MF 7278 Combine"] },
  { make: "New Holland", country: "آمریکا", models: ["TD5.90 Tractor", "TD5.105 Tractor", "T6.175 Tractor", "T7.270 Tractor", "CR8.90 Combine", "CX8.80 Combine", "FR920 Forage"] },
  { make: "Valtra", country: "فنلاند", models: ["A115 Tractor", "A145 Tractor", "T214 Tractor", "T234 Tractor", "N5 Tractor"] },
  { make: "MTZ Belarus", country: "بلاروس", models: ["MTZ-82.1 Tractor", "MTZ-952 Tractor", "MTZ-1221 Tractor", "MTZ-1523 Tractor"] },
  { make: "Same", country: "ایتالیا", models: ["Fortis 110 Tractor", "Fortis 130 Tractor", "Explorer 110 Tractor"] },
  { make: "Deutz-Fahr", country: "آلمان", models: ["5G 130 Tractor", "6G 210 Tractor", "7250 Agroplus", "9340 TTV"] },
  { make: "Case IH", country: "آمریکا", models: ["JX75 Tractor", "JX95 Tractor", "Farmall 75C Tractor", "Puma 210 Tractor", "Axial-Flow 8260 Combine"] },

  // Industrial / forklifts / generators
  { make: "Toyota Forklift", country: "ژاپن", models: ["2T Forklift", "5FBE20", "8FBE20", "8FDU25", "BT Staxio"] },
  { make: "Linde Material Handling", country: "آلمان", models: ["E20 Forklift", "E25 Forklift", "T20AP", "T16AP"] },
  { make: "Kobelco Forklift", country: "ژاپن", models: ["FD20", "FD30", "FD35", "FD50"] },
  { make: "Hyster Forklift", country: "آمریکا", models: ["H2.00XM", "H3.00XM", "H5.00XM"] },
  { make: "Cummins Generator", country: "آمریکا", models: ["C220 D5", "C330 D5", "C550 D5", "C880 D5", "C1400 D5"] },
  { make: "Caterpillar Generator", country: "آمریکا", models: ["C9 Generator", "C18 Generator", "C32 Generator", "3512 Generator", "3516 Generator"] },
];

// Get makes for a given mode
export function getMakesForMode(mode: "passenger" | "heavy"): VehicleMake[] {
  return mode === "passenger" ? PASSENGER_MAKES : HEAVY_MAKES;
}
