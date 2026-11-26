import { HsnCatalogItem } from '../types';
import { db } from '../db/database';

export const VERIFIED_HSN_CATALOG: HsnCatalogItem[] = [
  // --- 1. FIRE EXTINGUISHERS & FIRE SAFETY EQUIPMENT ---
  {
    id: 'hsn-8424-10-00',
    code: '8424 10 00',
    description: 'Fire extinguishers, whether or not charged (ABC, CO2, Foam, Clean Agent)',
    category: 'Fire Safety Equipment',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC Chapter 84 / Notification 1/2017-CT(R) Entry 325. Standard 18% GST.'
  },
  {
    id: 'hsn-8424-90-00',
    code: '8424 90 00',
    description: 'Parts of fire extinguishers (discharge horns, valve assemblies, siphon tubes, pressure gauges)',
    category: 'Fire Safety Equipment',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC Chapter 84. Extinguisher spare parts.'
  },
  {
    id: 'hsn-8481-80-90',
    code: '8481 80 90',
    description: 'Fire hydrant valves, landing valves, hose nozzles, branch pipes, breeching inlets',
    category: 'Fire Safety Equipment',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC Chapter 8481. Taps, cocks, and valves for fire hydrant pipelines.'
  },
  {
    id: 'hsn-5909-00-10',
    code: '5909 00 10',
    description: 'Textile hosepiping and canvas fire fighting delivery hoses (RRL / Type A & B)',
    category: 'Fire Safety Equipment',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC Chapter 5909. Fire fighting delivery hoses.'
  },
  {
    id: 'hsn-8424-89-90',
    code: '8424 89 90',
    description: 'Automatic fire sprinkler heads (pendant, upright, sidewall) and water spray nozzles',
    category: 'Fire Safety Equipment',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC Chapter 8424. Mechanical fire suppression spray heads.'
  },
  {
    id: 'hsn-3813-00-00',
    code: '3813 00 00',
    description: 'Preparations and charges for fire-extinguishers; charged fire-extinguishing grenades',
    category: 'Fire Safety Equipment',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC Chapter 3813. Fire extinguishing powder (MAP 50/90), AFFF foam concentrate.'
  },

  // --- 2. FIRE PROTECTION ACCESSORIES ---
  {
    id: 'hsn-8531-10-10',
    code: '8531 10 10',
    description: 'Fire alarms, smoke detectors, optical beam detectors, heat sensors',
    category: 'Fire Protection Accessories',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC Chapter 8531. Electric sound or visual signaling apparatus for fire detection.'
  },
  {
    id: 'hsn-8531-10-90',
    code: '8531 10 90',
    description: 'Manual call points (MCP), fire alarm sounders, hooters with strobe, flasher sirens',
    category: 'Fire Protection Accessories',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC Chapter 8531. Alarm initiation devices and notification appliances.'
  },
  {
    id: 'hsn-8531-90-00',
    code: '8531 90 00',
    description: 'Parts of fire alarm systems: Main fire alarm control panels (Conventional / Addressable)',
    category: 'Fire Protection Accessories',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC Chapter 8531. Control panels and annunciators.'
  },
  {
    id: 'hsn-9027-10-00',
    code: '9027 10 00',
    description: 'Gas detection equipment (LPG / CNG / toxic gas leak detectors, flame detectors)',
    category: 'Fire Protection Accessories',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC Chapter 9027. Gas or smoke analysis apparatus.'
  },
  {
    id: 'hsn-6506-10-10',
    code: '6506 10 10',
    description: 'Firefighter safety helmets and protective industrial headgear',
    category: 'Fire Protection Accessories',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC Chapter 6506. Safety headgear.'
  },
  {
    id: 'hsn-6211-33-00',
    code: '6211 33 00',
    description: 'Fire retardant suits, boiler suits, aluminized fire proximity suits',
    category: 'Fire Protection Accessories',
    type: 'GOODS',
    gstRate: 12,
    effectiveDate: '2017-07-01',
    isVerified: false,
    notes: 'CBIC Textile Chapter 62. Rate is 12% if sale value > ₹1,000; requires verification based on invoice value threshold.'
  },
  {
    id: 'hsn-3926-90-99',
    code: '3926 90 99',
    description: 'Photoluminescent fire exit signs, emergency evacuation signage, glow-in-dark vinyl boards',
    category: 'Fire Protection Accessories',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC Chapter 3926. Other articles of plastics.'
  },

  // --- 3. WOODEN PRODUCTS & FURNITURE ---
  {
    id: 'hsn-9403-30-00',
    code: '9403 30 00',
    description: 'Wooden furniture of a kind used in offices (desks, conference tables, executive workstations)',
    category: 'Wooden Products & Furniture',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 9403. Office wooden furniture.'
  },
  {
    id: 'hsn-9403-60-00',
    code: '9403 60 00',
    description: 'Other wooden furniture (cabinets, storage cupboards, wooden display racks, shelving units)',
    category: 'Wooden Products & Furniture',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 9403. General wooden furniture.'
  },
  {
    id: 'hsn-9401-61-00',
    code: '9401 61 00',
    description: 'Seats with wooden frames, upholstered (office chairs, visitor chairs)',
    category: 'Wooden Products & Furniture',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 9401. Upholstered wooden chairs.'
  },
  {
    id: 'hsn-4418-20-10',
    code: '4418 20 10',
    description: 'Wooden doors and their frames and thresholds (including Fire-Rated wooden doors 1hr/2hr)',
    category: 'Wooden Products & Furniture',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC Chapter 4418. Builders joinery and carpentry of wood.'
  },
  {
    id: 'hsn-4412-31-00',
    code: '4412 31 00',
    description: 'Plywood, veneered panels and similar laminated wood (Commercial / Marine / BWR grade)',
    category: 'Wooden Products & Furniture',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 4412. Plywood and laminated sheets.'
  },
  {
    id: 'hsn-4410-11-90',
    code: '4410 11 90',
    description: 'Particle board, prelaminated particle board (MDF / HDF boards)',
    category: 'Wooden Products & Furniture',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 4410. Particle board and MDF.'
  },
  {
    id: 'hsn-4407-10-00',
    code: '4407 10 00',
    description: 'Wood sawn or chipped lengthwise, sliced or peeled (Timber planks, wooden battens)',
    category: 'Wooden Products & Furniture',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC Chapter 4407. Sawn timber.'
  },

  // --- 4. ELECTRICAL EQUIPMENT ---
  {
    id: 'hsn-8536-20-30',
    code: '8536 20 30',
    description: 'Automatic circuit breakers: Miniature Circuit Breakers (MCB) up to 63A',
    category: 'Electrical Equipment',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 8536. MCBs and circuit breakers.'
  },
  {
    id: 'hsn-8536-30-00',
    code: '8536 30 00',
    description: 'Other apparatus for protecting electrical circuits: RCCB, ELCB, surge protection devices (SPD)',
    category: 'Electrical Equipment',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 8536. Electrical circuit protection.'
  },
  {
    id: 'hsn-8536-50-20',
    code: '8536 50 20',
    description: 'Modular switches, changeover switches, rotary switches, push buttons',
    category: 'Electrical Equipment',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 8536. Switches and isolators.'
  },
  {
    id: 'hsn-8536-69-10',
    code: '8536 69 10',
    description: 'Plugs and sockets (6A / 16A / 25A industrial power sockets and ceiling roses)',
    category: 'Electrical Equipment',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 8536. Plugs and sockets.'
  },
  {
    id: 'hsn-8537-10-00',
    code: '8537 10 00',
    description: 'Electrical distribution boards (DB), MCCB main panels, motor control centers (MCC) <= 1000V',
    category: 'Electrical Equipment',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 8537. Boards, panels, consoles, desks, cabinets for electric control.'
  },
  {
    id: 'hsn-8544-49-99',
    code: '8544 49 99',
    description: 'Electric copper/aluminum insulated wires, multicore flexible cables, fire survival cables (FRLS)',
    category: 'Electrical Equipment',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 8544. Insulated electric wire and cable.'
  },
  {
    id: 'hsn-8504-40-90',
    code: '8504 40 90',
    description: 'Static converters: Online UPS systems, battery inverters, DC power supply units for fire panels',
    category: 'Electrical Equipment',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 8504. Inverters, rectifiers and static converters.'
  },
  {
    id: 'hsn-9405-40-90',
    code: '9405 40 90',
    description: 'Emergency lights, rechargeable twin-spot LED exit lights, luminaire fixtures',
    category: 'Electrical Equipment',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 9405. Lamps and lighting fittings.'
  },

  // --- 5. HARDWARE & RELATED PRODUCTS ---
  {
    id: 'hsn-7318-15-00',
    code: '7318 15 00',
    description: 'Threaded screws and bolts of iron or steel, coach screws, hex bolts, anchor fasteners',
    category: 'Hardware & Fasteners',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 7318. Screws, bolts, nuts, coach screws of iron or steel.'
  },
  {
    id: 'hsn-7318-16-00',
    code: '7318 16 00',
    description: 'Nuts of iron or steel (hex nuts, nyloc nuts, flanged nuts)',
    category: 'Hardware & Fasteners',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 7318. Nuts.'
  },
  {
    id: 'hsn-7318-21-00',
    code: '7318 21 00',
    description: 'Spring washers and other lock washers of iron or steel',
    category: 'Hardware & Fasteners',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 7318. Non-threaded washers.'
  },
  {
    id: 'hsn-8302-10-10',
    code: '8302 10 10',
    description: 'Base metal hinges (butt hinges, stainless steel ball bearing hinges, heavy-duty door hinges)',
    category: 'Hardware & Fasteners',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 8302. Hinges of base metal.'
  },
  {
    id: 'hsn-8302-41-10',
    code: '8302 41 10',
    description: 'Automatic hydraulic door closers, floor springs, panic exit devices for fire escape doors',
    category: 'Hardware & Fasteners',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 8302. Door closers and architectural fittings.'
  },
  {
    id: 'hsn-8301-40-90',
    code: '8301 40 90',
    description: 'Door locks, mortise sashlocks, deadbolts, fire door latch hardware',
    category: 'Hardware & Fasteners',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 8301. Padlocks and locks of base metal.'
  },
  {
    id: 'hsn-7306-30-90',
    code: '7306 30 90',
    description: 'Mild Steel (MS) pipes, ERW black steel pipes, Galvanized Iron (GI) pipes for fire hydrant line',
    category: 'Hardware & Fasteners',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 7306. Tubes and pipes of iron or steel.'
  },
  {
    id: 'hsn-7326-90-99',
    code: '7326 90 99',
    description: 'Fabricated pipe clamps, U-bolts, clevis hangers, bracket supports for pipeline',
    category: 'Hardware & Fasteners',
    type: 'GOODS',
    gstRate: 18,
    effectiveDate: '2017-11-15',
    isVerified: true,
    notes: 'Official CBIC Chapter 7326. Other articles of iron or steel.'
  },

  // --- 6. SERVICES (SAC) ---
  {
    id: 'sac-998729',
    code: '998729',
    description: 'Maintenance, testing, hydraulic pressure testing and refilling services for fire extinguishers',
    category: 'Maintenance & Refilling Services',
    type: 'SERVICES',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC SAC 998729. Maintenance and repair services of other equipment.'
  },
  {
    id: 'sac-998719',
    code: '998719',
    description: 'Annual Maintenance Contract (AMC) for fire fighting systems, hydrant, alarm & safety systems',
    category: 'Maintenance & Refilling Services',
    type: 'SERVICES',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC SAC 998719. Maintenance and repair services of commercial and industrial machinery.'
  },
  {
    id: 'sac-995469',
    code: '995469',
    description: 'Installation and commissioning of fire protection systems, sprinkler networks & fire hydrant lines',
    category: 'Installation Services',
    type: 'SERVICES',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC SAC 995469. Other installation services (fire protection system installation).'
  },
  {
    id: 'sac-995461',
    code: '995461',
    description: 'Electrical installation, cabling, distribution board setup and testing services',
    category: 'Installation Services',
    type: 'SERVICES',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC SAC 995461. Electrical installation services.'
  },
  {
    id: 'sac-998399',
    code: '998399',
    description: 'Fire safety audit, safety compliance inspection, emergency plan design and technical consultancy',
    category: 'Consultancy & Auditing Services',
    type: 'SERVICES',
    gstRate: 18,
    effectiveDate: '2017-07-01',
    isVerified: true,
    notes: 'Official CBIC SAC 998399. Other professional, scientific and technical services.'
  }
];

/**
 * Initializes default verified HSN/SAC records in IndexedDB if the table is empty
 */
export async function initializeHsnCatalog(): Promise<void> {
  try {
    const count = await db.hsnCatalog.count();
    if (count === 0) {
      await db.hsnCatalog.bulkAdd(VERIFIED_HSN_CATALOG);
    }
  } catch (err) {
    console.warn('Failed to seed HSN catalog into IndexedDB:', err);
  }
}
