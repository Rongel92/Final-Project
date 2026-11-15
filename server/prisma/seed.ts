// Mock data for local development and demos.
//
// Wipes the database and fills it with two administrators, a set of employees,
// laptop models with inventory, and resales at every stage of the lifecycle
// (draft, scheduled, open, awaiting the draw, results with pickups in progress,
// completed, cancelled) together with the matching registrations, results,
// handovers, notifications and audit trail.
//
//   npm run seed                  (from server/)
//   npm run seed -- --if-empty    only seed a database that has no users yet

import 'dotenv/config';
import crypto from 'crypto';
import zlib from 'zlib';
import { PrismaClient, type LaptopModel, type Resale, type User } from '@prisma/client';
import {
  AGREEMENT_VERSION,
  REGISTRATION_DECLARATIONS,
  TERMS_VERSION,
  renderPurchaseAgreement,
} from '../src/constants';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed: NODE_ENV is production and the seed wipes the database.');
  process.exit(1);
}

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Deterministic randomness and dates
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261101);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const randomDigits = (n: number) => Array.from({ length: n }, () => randInt(0, 9)).join('');
const randomAlnum = (n: number) =>
  Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'[randInt(0, 33)]).join('');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date();

// A moment `days` from now (negative = past) at the given local time.
function at(days: number, hour = 10, minute = 0): Date {
  const d = new Date(NOW.getTime() + days * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
}
const plusHours = (date: Date, hours: number) => new Date(date.getTime() + hours * HOUR);
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ---------------------------------------------------------------------------
// Signature images (seeded handovers need a drawn signature PNG)
// ---------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// Draws a cursive-looking scribble, unique per name, as a PNG data URL.
function signatureDataUrl(name: string): string {
  const W = 320;
  const H = 100;
  const pixels = Buffer.alloc(W * H * 4); // transparent RGBA
  const r = mulberry32(crypto.createHash('sha256').update(name).digest().readUInt32BE(0));
  const loops = 6 + r() * 4;
  const wave = 1 + r() * 2;
  const phase = r() * Math.PI * 2;

  const ink = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const px = Math.round(x) + dx;
        const py = Math.round(y) + dy;
        if (px < 0 || py < 0 || px >= W || py >= H || dx * dx + dy * dy > 1) continue;
        pixels.set([22, 32, 84, 255], (py * W + px) * 4);
      }
    }
  };

  const steps = 3000;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const turn = t * Math.PI * 2 * loops;
    const x = 24 + t * 260 + 11 * Math.cos(turn + phase);
    const y = 50 + 20 * Math.sin(t * Math.PI * 2 * wave + phase) * (1 - 0.5 * t) + 13 * Math.sin(turn + phase);
    ink(x, y);
  }
  for (let x = 60; x <= 290; x += 0.5) ink(x, 84 - (x - 60) * 0.04); // underline flourish

  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y += 1) pixels.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(W, 0);
  header.writeUInt32BE(H, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

const MANAGERS: Record<string, string> = {
  'R&D': 'Yael Shapiro',
  QA: 'Oren Mizrahi',
  Product: 'Tamar Golan',
  Sales: 'David Friedman',
  Marketing: 'Shira Levi',
  Finance: 'Avi Peretz',
  HR: 'Michal Cohen',
  IT: 'Ronit Katz',
  'Customer Success': 'Eitan Bar',
  Operations: 'Gil Ashkenazi',
};

const TLV = 'Tel Aviv HQ';
const HAIFA = 'Haifa';
const BEERSHEVA = "Be'er Sheva";

const ADMINS: [string, string, string][] = [
  ['Noa Ben-David', 'IT', TLV],
  ['Daniel Avraham', 'Operations', TLV],
];

// [full name, department, site]
const EMPLOYEES: [string, string, string][] = [
  ['Dana Levi', 'R&D', TLV],
  ['Yossi Cohen', 'R&D', TLV],
  ['Noam Friedman', 'QA', HAIFA],
  ['Maya Rosen', 'Product', TLV],
  ['Amit Ben-Ami', 'R&D', HAIFA],
  ['Lior Shalev', 'Sales', TLV],
  ['Hila Avraham', 'Marketing', TLV],
  ['Omer Dahan', 'IT', TLV],
  ['Gal Peretz', 'Finance', TLV],
  ['Shani Mor', 'HR', TLV],
  ['Itay Barak', 'R&D', BEERSHEVA],
  ['Roni Elbaz', 'Customer Success', HAIFA],
  ['Tal Weiss', 'QA', TLV],
  ['Neta Klein', 'Product', TLV],
  ['Eyal Segal', 'Operations', HAIFA],
  ['Adi Navon', 'R&D', TLV],
  ['Ofir Hadad', 'Sales', TLV],
  ['Liat Carmi', 'Finance', TLV],
  ['Yonatan Azulay', 'R&D', HAIFA],
  ['Michal Sasson', 'Marketing', HAIFA],
  ['Ido Gross', 'IT', HAIFA],
  ['Keren Amar', 'Customer Success', HAIFA],
  ['Asaf Lavi', 'R&D', HAIFA],
  ['Sivan Oz', 'HR', HAIFA],
  ['Nadav Tzur', 'QA', BEERSHEVA],
  ['Inbal Harari', 'Product', TLV],
  ['Ariel Kaplan', 'Operations', TLV],
  ['Efrat Malka', 'Sales', TLV],
  ['Ben Stern', 'R&D', TLV],
  ['Moran Yosef', 'Customer Success', BEERSHEVA],
  ['Guy Rubin', 'Finance', TLV],
  ['Yarden Shemesh', 'R&D', TLV],
  // Not registered anywhere: free to try the registration flow.
  ['Rotem Ziv', 'Product', TLV],
  // Marked ineligible by an administrator.
  ['Elad Tal', 'Sales', HAIFA],
  // Left the company (inactive, hidden from sign-in).
  ['Hadas Peleg', 'Marketing', TLV],
];

interface ModelSpec {
  manufacturer: string;
  modelName: string;
  processor: string;
  memory: string;
  storage: string;
  screenSize: string;
  operatingSystem: string;
  condition: string;
  batteryCondition: string;
  accessories: string;
  description: string;
  price: number;
  serial: () => string;
  units: number;
}

const MODEL_SPECS: Record<string, ModelSpec> = {
  lat5420: {
    manufacturer: 'Dell',
    modelName: 'Latitude 5420',
    processor: 'Intel Core i5-1145G7',
    memory: '16 GB',
    storage: '256 GB SSD',
    screenSize: '14"',
    operatingSystem: 'Windows 11 Pro',
    condition: 'Good',
    batteryCondition: 'Good (84% capacity)',
    accessories: '65W USB-C charger',
    description: 'Dependable everyday business laptop with a full-HD display and backlit keyboard.',
    price: 900,
    serial: () => randomAlnum(7),
    units: 8,
  },
  lat7430: {
    manufacturer: 'Dell',
    modelName: 'Latitude 7430',
    processor: 'Intel Core i7-1265U',
    memory: '16 GB',
    storage: '512 GB SSD',
    screenSize: '14"',
    operatingSystem: 'Windows 11 Pro',
    condition: 'Very good',
    batteryCondition: 'Very good (91% capacity)',
    accessories: '65W USB-C charger',
    description: 'Lightweight premium business laptop with a fast SSD and long battery life.',
    price: 1600,
    serial: () => randomAlnum(7),
    units: 6,
  },
  t14: {
    manufacturer: 'Lenovo',
    modelName: 'ThinkPad T14 Gen 2',
    processor: 'AMD Ryzen 7 PRO 5850U',
    memory: '16 GB',
    storage: '512 GB SSD',
    screenSize: '14"',
    operatingSystem: 'Windows 11 Pro',
    condition: 'Good',
    batteryCondition: 'Good (80% capacity)',
    accessories: '65W USB-C charger',
    description: 'Classic ThinkPad keyboard, 8-core processor, great for development work.',
    price: 1200,
    serial: () => `PF${randomAlnum(6)}`,
    units: 7,
  },
  x1: {
    manufacturer: 'Lenovo',
    modelName: 'ThinkPad X1 Carbon Gen 9',
    processor: 'Intel Core i7-1165G7',
    memory: '16 GB',
    storage: '512 GB SSD',
    screenSize: '14"',
    operatingSystem: 'Windows 11 Pro',
    condition: 'Excellent',
    batteryCondition: 'Very good (89% capacity)',
    accessories: '65W USB-C charger, sleeve',
    description: 'Ultra-light carbon-fibre chassis with a 16:10 display. Barely used.',
    price: 1900,
    serial: () => `PF${randomAlnum(6)}`,
    units: 5,
  },
  hp840: {
    manufacturer: 'HP',
    modelName: 'EliteBook 840 G8',
    processor: 'Intel Core i5-1135G7',
    memory: '16 GB',
    storage: '256 GB SSD',
    screenSize: '14"',
    operatingSystem: 'Windows 11 Pro',
    condition: 'Fair',
    batteryCondition: 'Battery replacement recommended (68% capacity)',
    accessories: '65W charger',
    description: 'Solid aluminium build. Light wear on the lid and palm rest.',
    price: 750,
    serial: () => `5CG${randomDigits(7)}`,
    units: 6,
  },
  mbp14: {
    manufacturer: 'Apple',
    modelName: 'MacBook Pro 14" (M1 Pro, 2021)',
    processor: 'Apple M1 Pro (8-core CPU, 14-core GPU)',
    memory: '16 GB',
    storage: '512 GB SSD',
    screenSize: '14.2"',
    operatingSystem: 'macOS Sequoia',
    condition: 'Very good',
    batteryCondition: 'Very good (90% capacity)',
    accessories: '67W USB-C charger',
    description: 'Liquid Retina XDR display and outstanding battery life. Wiped and reinstalled.',
    price: 3200,
    serial: () => `C02${randomAlnum(9)}`,
    units: 4,
  },
};

const INSTRUCTIONS =
  'Select up to three laptop models in order of preference. If you are selected you will be ' +
  'offered the highest-priority model that is still available. Winners must accept within 5 ' +
  'working days and collect the laptop during the pickup window.';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Helpers that write records the way the app's own flows do
// ---------------------------------------------------------------------------

async function audit(
  createdAt: Date,
  actor: User | null,
  action: string,
  entityType: string,
  entityId: string,
  extra: { previousValue?: unknown; newValue?: unknown; reason?: string } = {}
) {
  await prisma.auditLog.create({
    data: {
      userId: actor?.id ?? null,
      role: actor?.role ?? 'SYSTEM',
      action,
      entityType,
      entityId,
      previousValue: extra.previousValue === undefined ? null : JSON.stringify(extra.previousValue),
      newValue: extra.newValue === undefined ? null : JSON.stringify(extra.newValue),
      reason: extra.reason ?? null,
      createdAt,
    },
  });
}

async function notify(
  createdAt: Date,
  user: User,
  data: {
    type: string;
    title: string;
    message: string;
    resaleId?: string;
    registrationId?: string;
    actionUrl?: string;
  }
) {
  // Older notifications have been read; recent ones are a mix.
  const isRead = createdAt.getTime() < NOW.getTime() - 10 * DAY || rand() < 0.35;
  await prisma.notification.create({
    data: {
      userId: user.id,
      ...data,
      isRead,
      readAt: isRead ? plusHours(createdAt, randInt(1, 30)) : null,
      createdAt,
    },
  });
}

interface Line {
  model: LaptopModel;
  quantity: number;
  price: number;
}

interface ResaleCtx {
  resale: Resale;
  lines: Line[];
  pickupLocation: string;
  admin: User;
}

async function createResale(input: {
  title: string;
  description: string;
  status: string;
  site: string;
  admin: User;
  createdAt: Date;
  publishedAt?: Date;
  openAt: Date;
  closeAt: Date;
  drawAt: Date;
  pickupStartAt: Date;
  pickupEndAt: Date;
  closedAt?: Date;
  eligibilityMode?: 'PARTICIPATION' | 'PURCHASE';
  lines: Line[];
}): Promise<ResaleCtx> {
  const pickupLocation = `${input.site} — IT service desk, ground floor`;
  const resale = await prisma.resale.create({
    data: {
      title: input.title,
      description: input.description,
      instructions: INSTRUCTIONS,
      status: input.status,
      site: input.site,
      registrationOpenAt: input.openAt,
      registrationCloseAt: input.closeAt,
      resaleAt: input.drawAt,
      pickupStartAt: input.pickupStartAt,
      pickupEndAt: input.pickupEndAt,
      eligibilityMode: input.eligibilityMode ?? 'PARTICIPATION',
      termsVersion: TERMS_VERSION,
      createdBy: input.admin.id,
      createdAt: input.createdAt,
      publishedAt: input.publishedAt ?? null,
      closedAt: input.closedAt ?? null,
      models: {
        create: input.lines.map((l) => ({
          laptopModelId: l.model.id,
          quantity: l.quantity,
          price: l.price,
          pickupLocation,
          createdAt: input.createdAt,
        })),
      },
    },
  });
  await audit(input.createdAt, input.admin, 'RESALE_CREATED', 'Resale', resale.id, {
    newValue: { title: input.title },
  });
  if (input.publishedAt) {
    await audit(input.publishedAt, input.admin, 'RESALE_PUBLISHED', 'Resale', resale.id, {
      previousValue: { status: 'DRAFT' },
      newValue: { status: input.openAt <= input.publishedAt ? 'OPEN' : 'SCHEDULED' },
    });
  }
  if (input.publishedAt && input.openAt > input.publishedAt && input.openAt <= NOW) {
    await audit(input.openAt, null, 'RESALE_OPENED', 'Resale', resale.id, {
      previousValue: { status: 'SCHEDULED' },
      newValue: { status: 'OPEN' },
      reason: 'Registration window started automatically.',
    });
  }
  if (input.closedAt) {
    await audit(input.closedAt, null, 'RESALE_CLOSED', 'Resale', resale.id, {
      previousValue: { status: 'OPEN' },
      newValue: { status: 'CLOSED' },
      reason: 'Registration window ended automatically.',
    });
  }
  return { resale, lines: input.lines, pickupLocation, admin: input.admin };
}

interface EntrantSpec {
  user: User;
  choices: LaptopModel[]; // most wanted first
  submittedAt: Date;
  cancelledAt?: Date;
  excludedReason?: string;
  overrideReason?: string;
}

interface Entry extends EntrantSpec {
  registrationId: string;
}

async function register(ctx: ResaleCtx, spec: EntrantSpec): Promise<Entry> {
  const { resale, admin } = ctx;
  const status = spec.cancelledAt ? 'CANCELLED' : spec.excludedReason ? 'EXCLUDED' : 'SUBMITTED';
  const reg = await prisma.registration.create({
    data: {
      resaleId: resale.id,
      userId: spec.user.id,
      selectedLaptopModelId: spec.choices[0].id,
      multiChoiceAck: spec.choices.length > 1,
      status,
      eligibilityStatus: spec.excludedReason
        ? 'INELIGIBLE'
        : spec.overrideReason
          ? 'OVERRIDDEN'
          : 'ELIGIBLE',
      eligibilityReason: spec.excludedReason
        ? spec.excludedReason
        : spec.overrideReason
          ? 'Participated within the cooldown period.'
          : 'Eligible to participate.',
      eligibilityOverride: Boolean(spec.overrideReason),
      overrideReason: spec.overrideReason ?? null,
      overrideBy: spec.overrideReason ? admin.id : null,
      termsAccepted: true,
      termsVersion: resale.termsVersion,
      typedFullName: spec.user.fullName,
      ipAddress: `10.20.${randInt(1, 254)}.${randInt(1, 254)}`,
      userAgent: USER_AGENT,
      submittedAt: spec.submittedAt,
      cancelledAt: spec.cancelledAt ?? null,
      createdAt: spec.submittedAt,
      declarations: {
        create: REGISTRATION_DECLARATIONS.map((d) => ({
          declarationKey: d.key,
          declarationText: d.text,
          declarationVersion: TERMS_VERSION,
          accepted: true,
          acceptedAt: spec.submittedAt,
        })),
      },
      modelChoices: {
        create: spec.choices.map((m, priority) => ({
          laptopModelId: m.id,
          priority,
          createdAt: spec.submittedAt,
        })),
      },
    },
  });

  await audit(spec.submittedAt, spec.user, 'REGISTRATION_SUBMITTED', 'Registration', reg.id, {
    newValue: { resaleId: resale.id },
  });
  await notify(spec.submittedAt, spec.user, {
    type: 'REGISTRATION_SUBMITTED',
    title: 'Registration confirmed',
    message: `Your registration for "${resale.title}" was received.`,
    resaleId: resale.id,
    registrationId: reg.id,
    actionUrl: '/my-registrations',
  });
  if (spec.cancelledAt) {
    await audit(spec.cancelledAt, spec.user, 'REGISTRATION_CANCELLED', 'Registration', reg.id);
    await notify(spec.cancelledAt, spec.user, {
      type: 'REGISTRATION_CANCELLED',
      title: 'Registration cancelled',
      message: `Your registration for "${resale.title}" was cancelled.`,
      resaleId: resale.id,
      registrationId: reg.id,
    });
  }
  if (spec.excludedReason) {
    await audit(plusHours(spec.submittedAt, 30), admin, 'REGISTRATION_EXCLUDED', 'Registration', reg.id, {
      reason: spec.excludedReason,
    });
  }
  if (spec.overrideReason) {
    await audit(plusHours(spec.submittedAt, 20), admin, 'ELIGIBILITY_OVERRIDE', 'Registration', reg.id, {
      newValue: { eligibilityStatus: 'OVERRIDDEN' },
      reason: spec.overrideReason,
    });
  }
  return { ...spec, registrationId: reg.id };
}

interface Winner {
  entry: Entry;
  resultId: string;
  assignmentId: string;
  model: LaptopModel;
}

interface DrawOutcome {
  winners: Winner[]; // grouped by model, in random pick order within each
  waiting: Map<string, Entry[]>; // laptopModelId -> waiting list in order
}

const modelName = (m: LaptopModel) => `${m.manufacturer} ${m.modelName}`;

// Mirrors services/resale.ts runResale + publishResults: one global random pick
// order; each pick takes their highest-priority model still in stock; everyone
// else joins the waiting list of each model they chose.
async function runDraw(ctx: ResaleCtx, entries: Entry[], drawAt: Date): Promise<DrawOutcome> {
  const { resale, lines, admin } = ctx;
  const seed = crypto.randomBytes(24).toString('hex');
  const resaleRunId = crypto.randomUUID();
  const valid = entries.filter((e) => !e.cancelledAt && !e.excludedReason);
  const pickOrder = shuffle(valid);
  const capacity = new Map(lines.map((l) => [l.model.id, l.quantity]));

  const wonModel = new Map<string, LaptopModel>();
  for (const e of pickOrder) {
    const model = e.choices.find((m) => (capacity.get(m.id) ?? 0) > 0);
    if (model) {
      capacity.set(model.id, capacity.get(model.id)! - 1);
      wonModel.set(e.registrationId, model);
    }
  }

  const winners: Winner[] = [];
  const waiting = new Map<string, Entry[]>();
  for (const line of lines) {
    let order = 0;
    for (const e of pickOrder.filter((p) => wonModel.get(p.registrationId)?.id === line.model.id)) {
      const result = await prisma.resaleResult.create({
        data: {
          resaleId: resale.id,
          registrationId: e.registrationId,
          laptopModelId: line.model.id,
          resultType: 'WINNER',
          resultOrder: order,
          randomSeedReference: seed,
          resaleRunId,
          createdAt: drawAt,
          publishedAt: drawAt,
          assignment: { create: { status: 'PENDING', createdAt: drawAt } },
        },
        include: { assignment: true },
      });
      await prisma.registration.update({
        where: { id: e.registrationId },
        data: { status: 'WINNER', selectedLaptopModelId: line.model.id },
      });
      winners.push({ entry: e, resultId: result.id, assignmentId: result.assignment!.id, model: line.model });
      order += 1;
    }

    const waitingHere = pickOrder.filter(
      (p) => !wonModel.has(p.registrationId) && p.choices.some((m) => m.id === line.model.id)
    );
    waiting.set(line.model.id, waitingHere);
    order = 0;
    for (const e of waitingHere) {
      await prisma.resaleResult.create({
        data: {
          resaleId: resale.id,
          registrationId: e.registrationId,
          laptopModelId: line.model.id,
          resultType: 'WAITING_LIST',
          resultOrder: order,
          randomSeedReference: seed,
          resaleRunId,
          createdAt: drawAt,
          publishedAt: drawAt,
        },
      });
      await prisma.registration.update({
        where: { id: e.registrationId },
        data: { status: 'WAITING_LIST' },
      });
      order += 1;
    }
  }

  for (const e of entries.filter((x) => x.excludedReason)) {
    await prisma.resaleResult.create({
      data: {
        resaleId: resale.id,
        registrationId: e.registrationId,
        laptopModelId: e.choices[0].id,
        resultType: 'EXCLUDED',
        randomSeedReference: seed,
        resaleRunId,
        createdAt: drawAt,
        publishedAt: drawAt,
      },
    });
  }

  await prisma.resale.update({
    where: { id: resale.id },
    data: { status: 'RESULTS_PUBLISHED', resaleAt: drawAt, publishedAt: drawAt },
  });
  const winnersByModel = Object.fromEntries(
    lines.map((l) => [l.model.id, winners.filter((w) => w.model.id === l.model.id).length])
  );
  await audit(drawAt, admin, 'RESALE_EXECUTED', 'Resale', resale.id, {
    newValue: { resaleRunId, seed, winnersByModel },
  });
  await audit(drawAt, admin, 'RESULTS_PUBLISHED', 'Resale', resale.id);

  // Result notifications.
  const notifyAt = plusHours(drawAt, 0.2);
  for (const w of winners) {
    await notify(notifyAt, w.entry.user, {
      type: 'SELECTED_WINNER',
      title: 'You have been selected!',
      message: `Congratulations! You were selected in "${resale.title}" for the ${modelName(w.model)}. Acceptance instructions are available.`,
      resaleId: resale.id,
      registrationId: w.entry.registrationId,
      actionUrl: `/pickup/${w.entry.registrationId}`,
    });
  }
  const notified = new Set<string>();
  for (const line of lines) {
    for (const [position, e] of (waiting.get(line.model.id) ?? []).entries()) {
      if (notified.has(e.registrationId)) continue;
      notified.add(e.registrationId);
      await notify(notifyAt, e.user, {
        type: 'ADDED_WAITING_LIST',
        title: 'You are on the waiting list',
        message: `You were placed on the waiting list (position ${position + 1}) for "${resale.title}".`,
        resaleId: resale.id,
        registrationId: e.registrationId,
        actionUrl: `/results/${resale.id}`,
      });
    }
  }
  for (const e of entries.filter((x) => x.excludedReason)) {
    await prisma.registration.update({ where: { id: e.registrationId }, data: { status: 'EXCLUDED' } });
    await notify(notifyAt, e.user, {
      type: 'NOT_SELECTED',
      title: 'Resale results published',
      message: `The results for "${resale.title}" have been published.`,
      resaleId: resale.id,
      registrationId: e.registrationId,
      actionUrl: `/results/${resale.id}`,
    });
  }

  return { winners, waiting };
}

function lineFor(ctx: ResaleCtx, model: LaptopModel): Line {
  return ctx.lines.find((l) => l.model.id === model.id)!;
}

// The winner accepts the laptop (no signature yet; that happens at pickup).
async function claim(ctx: ResaleCtx, w: Winner, claimedAt: Date) {
  const handover = await prisma.handoverRecord.create({
    data: {
      registrationId: w.entry.registrationId,
      userId: w.entry.user.id,
      resaleId: ctx.resale.id,
      laptopModelId: w.model.id,
      price: lineFor(ctx, w.model).price,
      pickupLocation: ctx.pickupLocation,
      claimedAt,
      createdAt: claimedAt,
    },
  });
  await audit(claimedAt, w.entry.user, 'HANDOVER_CLAIMED', 'HandoverRecord', handover.id, {
    newValue: { registrationId: w.entry.registrationId },
  });
  await notify(claimedAt, w.entry.user, {
    type: 'ADMIN_UPDATE',
    title: 'Laptop accepted',
    message: `You accepted your laptop for "${ctx.resale.title}". You'll receive an email soon with your pickup date and time.`,
    resaleId: ctx.resale.id,
    registrationId: w.entry.registrationId,
  });
  return handover;
}

// The laptop is physically handed over: signed agreement, unit assigned,
// participation recorded (mirrors routes/handovers.ts handover-complete).
async function complete(ctx: ResaleCtx, w: Winner, claimedAt: Date, completedAt: Date) {
  const handover = await claim(ctx, w, claimedAt);
  const price = lineFor(ctx, w.model).price;
  const unit = await prisma.laptopUnit.findFirst({
    where: { laptopModelId: w.model.id, status: 'AVAILABLE' },
    orderBy: [{ createdAt: 'asc' }, { serialNumber: 'asc' }],
  });
  if (unit) {
    await prisma.laptopUnit.update({
      where: { id: unit.id },
      data: { status: 'HANDED_OVER', assignedUserId: w.entry.user.id },
    });
  }
  await prisma.handoverRecord.update({
    where: { id: handover.id },
    data: {
      laptopUnitId: unit?.id ?? null,
      serialNumber: unit?.serialNumber ?? null,
      assetNumber: unit?.assetNumber ?? null,
      employeeConfirmation: true,
      employeeTypedName: w.entry.user.fullName,
      idNumber: randomDigits(9),
      signatureData: signatureDataUrl(w.entry.user.fullName),
      agreementVersion: AGREEMENT_VERSION,
      agreementText: renderPurchaseAgreement(price),
      employeeConfirmedAt: completedAt,
      payrollDeductionConfirmed: true,
      administratorConfirmation: true,
      administratorId: ctx.admin.id,
      administratorConfirmedAt: completedAt,
      completedAt,
    },
  });
  await prisma.registration.update({
    where: { id: w.entry.registrationId },
    data: { status: 'COMPLETED' },
  });
  await prisma.winnerAssignment.update({
    where: { id: w.assignmentId },
    data: { status: 'COMPLETED', respondedAt: claimedAt },
  });
  await prisma.participationHistory.create({
    data: {
      userId: w.entry.user.id,
      resaleId: ctx.resale.id,
      registrationId: w.entry.registrationId,
      participationDate: completedAt,
      winner: true,
      purchaseCompleted: true,
      handoverCompletedAt: completedAt,
      nextEligibleAt: addMonths(completedAt, ctx.resale.cooldownMonths),
      createdAt: completedAt,
    },
  });
  for (const action of ['HANDOVER_EMPLOYEE_CONFIRMED', 'HANDOVER_ADMIN_CONFIRMED', 'HANDOVER_COMPLETED']) {
    await audit(completedAt, ctx.admin, action, 'HandoverRecord', handover.id, {
      newValue: { registrationId: w.entry.registrationId },
    });
  }
  await notify(completedAt, w.entry.user, {
    type: 'ADMIN_UPDATE',
    title: 'Handover complete',
    message: `Your ${modelName(w.model)} from "${ctx.resale.title}" has been handed over. Enjoy!`,
    resaleId: ctx.resale.id,
    registrationId: w.entry.registrationId,
  });
}

// The winner declines; the next person on that model's waiting list is promoted
// (mirrors services/results.ts changeWinnerAssignmentStatus).
async function decline(
  ctx: ResaleCtx,
  w: Winner,
  draw: DrawOutcome,
  declinedAt: Date,
  reason: string
): Promise<Winner | null> {
  const handover = await prisma.handoverRecord.create({
    data: {
      registrationId: w.entry.registrationId,
      userId: w.entry.user.id,
      resaleId: ctx.resale.id,
      laptopModelId: w.model.id,
      price: lineFor(ctx, w.model).price,
      pickupLocation: ctx.pickupLocation,
      declinedAt,
      declineReason: reason,
      createdAt: declinedAt,
    },
  });
  await prisma.winnerAssignment.update({
    where: { id: w.assignmentId },
    data: { status: 'DECLINED', respondedAt: declinedAt },
  });
  await prisma.registration.update({
    where: { id: w.entry.registrationId },
    data: { status: 'DECLINED' },
  });
  await audit(declinedAt, w.entry.user, 'WINNER_STATUS_CHANGED', 'WinnerAssignment', w.assignmentId, {
    previousValue: { status: 'PENDING' },
    newValue: { status: 'DECLINED' },
    reason,
  });
  await audit(declinedAt, w.entry.user, 'HANDOVER_DECLINED', 'HandoverRecord', handover.id, {
    newValue: { registrationId: w.entry.registrationId, reason },
  });

  const queue = draw.waiting.get(w.model.id) ?? [];
  const promotedIndex = queue.findIndex((e) => !draw.winners.some((x) => x.entry === e));
  if (promotedIndex < 0) return null;
  const next = queue.splice(promotedIndex, 1)[0];

  const waitingResult = await prisma.resaleResult.findFirstOrThrow({
    where: {
      registrationId: next.registrationId,
      laptopModelId: w.model.id,
      resultType: 'WAITING_LIST',
    },
  });
  const promotedAt = plusHours(declinedAt, 0.1);
  await prisma.resaleResult.update({ where: { id: waitingResult.id }, data: { resultType: 'WINNER' } });
  const assignment = await prisma.winnerAssignment.create({
    data: {
      resaleResultId: waitingResult.id,
      status: 'PENDING',
      replacementFromResultId: w.resultId,
      createdAt: promotedAt,
    },
  });
  await prisma.registration.update({
    where: { id: next.registrationId },
    data: { status: 'WINNER', selectedLaptopModelId: w.model.id },
  });
  await audit(promotedAt, null, 'WAITING_LIST_REPLACEMENT', 'ResaleResult', waitingResult.id, {
    reason: 'Waiting-list replacement after a declined winner.',
  });
  await notify(promotedAt, next.user, {
    type: 'WINNER_REPLACEMENT',
    title: 'You have been selected from the waiting list',
    message: `A spot opened up in "${ctx.resale.title}" and you have been selected for the ${modelName(w.model)}.`,
    resaleId: ctx.resale.id,
    registrationId: next.registrationId,
    actionUrl: `/pickup/${next.registrationId}`,
  });

  const promoted: Winner = {
    entry: next,
    resultId: waitingResult.id,
    assignmentId: assignment.id,
    model: w.model,
  };
  draw.winners.push(promoted);
  return promoted;
}

// Registrations for `users`, each picking 1-3 of the resale's models in a
// random priority order, submitted at random times in the first `withinDays`.
function entrants(ctx: ResaleCtx, users: User[], withinDays: number, allModels = false): EntrantSpec[] {
  const models = ctx.lines.map((l) => l.model);
  return users.map((user) => {
    const ordered = shuffle(models);
    const count = allModels ? models.length : randInt(1, Math.min(3, models.length));
    const submittedAt = new Date(
      ctx.resale.registrationOpenAt.getTime() + rand() * withinDays * DAY + randInt(1, 8) * HOUR
    );
    return { user, choices: ordered.slice(0, count), submittedAt };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function wipe() {
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.participationHistory.deleteMany();
  await prisma.handoverRecord.deleteMany();
  await prisma.winnerAssignment.deleteMany();
  await prisma.resaleResult.deleteMany();
  await prisma.registrationModelChoice.deleteMany();
  await prisma.registrationDeclaration.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.uploadedForm.deleteMany();
  await prisma.laptopUnit.deleteMany();
  await prisma.resaleLaptopModel.deleteMany();
  await prisma.resale.deleteMany();
  await prisma.laptopModel.deleteMany();
  await prisma.user.deleteMany();
}

const emailFor = (fullName: string) =>
  `${fullName
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '')
    .trim()
    .split(/\s+/)
    .join('.')}@company.local`;

async function main() {
  if (process.argv.includes('--if-empty') && (await prisma.user.count()) > 0) {
    console.log('Database already has data; skipping the seed (--if-empty).');
    return;
  }
  await wipe();

  // --- Users -----------------------------------------------------------------
  const userCreatedAt = at(-420, 9);
  const createUser = (
    [fullName, department, site]: [string, string, string],
    role: 'ADMIN' | 'EMPLOYEE',
    extra: { isActive?: boolean; manualEligibility?: string; eligibilityNote?: string } = {}
  ) =>
    prisma.user.create({
      data: {
        fullName,
        email: emailFor(fullName),
        department,
        site,
        country: 'Israel',
        managerName: MANAGERS[department],
        role,
        createdAt: userCreatedAt,
        ...extra,
      },
    });

  const admins: User[] = [];
  for (const a of ADMINS) admins.push(await createUser(a, 'ADMIN'));
  const [adminA, adminB] = admins;

  const employees: User[] = [];
  for (const e of EMPLOYEES) {
    const extra =
      e[0] === 'Elad Tal'
        ? {
            manualEligibility: 'INELIGIBLE',
            eligibilityNote: 'Did not collect a laptop won in a previous resale.',
          }
        : e[0] === 'Hadas Peleg'
          ? { isActive: false }
          : {};
    employees.push(await createUser(e, 'EMPLOYEE', extra));
  }

  // --- Laptop models and inventory --------------------------------------------
  const models: Record<string, LaptopModel> = {};
  let assetNo = 1000;
  for (const [key, spec] of Object.entries(MODEL_SPECS)) {
    const { serial, units, ...fields } = spec;
    const model = await prisma.laptopModel.create({
      data: { ...fields, currency: 'ILS', createdAt: at(-240, 9) },
    });
    models[key] = model;
    for (let i = 0; i < units; i += 1) {
      assetNo += randInt(1, 9);
      await prisma.laptopUnit.create({
        data: {
          laptopModelId: model.id,
          serialNumber: serial(),
          assetNumber: `IT-2021-${assetNo}`,
          condition: spec.condition,
          status: 'AVAILABLE',
          createdAt: at(-240, 9, i),
        },
      });
    }
  }
  // A few units that are out of circulation.
  await prisma.laptopUnit.create({
    data: {
      laptopModelId: models.lat5420.id,
      serialNumber: MODEL_SPECS.lat5420.serial(),
      assetNumber: `IT-2020-${assetNo + 7}`,
      condition: 'Cosmetic damage',
      status: 'REMOVED',
      createdAt: at(-240, 9, 30),
    },
  });
  await prisma.laptopUnit.create({
    data: {
      laptopModelId: models.hp840.id,
      serialNumber: MODEL_SPECS.hp840.serial(),
      assetNumber: `IT-2020-${assetNo + 13}`,
      condition: 'Battery replacement recommended',
      status: 'UNAVAILABLE',
      createdAt: at(-240, 9, 31),
    },
  });

  const emp = (name: string) => employees.find((u) => u.fullName === name)!;

  // --- A: Spring resale — completed --------------------------------------------
  const spring = await createResale({
    title: 'Spring 2026 Laptop Resale',
    description: 'Refurbished Dell and HP laptops returned during the spring hardware refresh.',
    status: 'OPEN',
    site: TLV,
    admin: adminA,
    createdAt: at(-225, 11),
    publishedAt: at(-220, 9),
    openAt: at(-215, 9),
    closeAt: at(-201, 17),
    closedAt: at(-201, 17),
    drawAt: at(-200, 12),
    pickupStartAt: at(-195, 9),
    pickupEndAt: at(-180, 17),
    lines: [
      { model: models.lat5420, quantity: 2, price: 900 },
      { model: models.hp840, quantity: 2, price: 750 },
    ],
  });
  const springEntries: Entry[] = [];
  for (const spec of entrants(spring, employees.slice(0, 6), 12, true)) {
    springEntries.push(await register(spring, spec));
  }
  const springDraw = await runDraw(spring, springEntries, at(-200, 12));
  const springWinners = [...springDraw.winners];
  for (const [i, w] of springWinners.slice(0, 3).entries()) {
    await complete(spring, w, at(-198, 9 + i), at(-194 + i * 3, 14));
  }
  let springDecliner: User | null = null;
  if (springWinners[3]) {
    springDecliner = springWinners[3].entry.user;
    const promoted = await decline(
      spring,
      springWinners[3],
      springDraw,
      at(-197, 16),
      'I decided to keep using my personal laptop.'
    );
    if (promoted) await complete(spring, promoted, at(-196, 10), at(-186, 11));
  }
  await prisma.resale.update({ where: { id: spring.resale.id }, data: { status: 'COMPLETED' } });
  // Completing a resale closes its waiting list (as routes/resales.ts does).
  await prisma.registration.updateMany({
    where: { resaleId: spring.resale.id, status: 'WAITING_LIST' },
    data: { status: 'NOT_SELECTED' },
  });
  await audit(at(-179, 10), adminA, 'RESALE_COMPLETED', 'Resale', spring.resale.id, {
    previousValue: { status: 'RESULTS_PUBLISHED' },
    newValue: { status: 'COMPLETED' },
  });

  // --- G: Be'er Sheva resale — cancelled before it opened -----------------------
  const cancelled = await createResale({
    title: "August 2026 Resale — Be'er Sheva",
    description: "Laptops for the Be'er Sheva office.",
    status: 'CANCELLED',
    site: BEERSHEVA,
    admin: adminB,
    createdAt: at(-95, 10),
    publishedAt: at(-90, 9),
    openAt: at(-80, 9),
    closeAt: at(-66, 17),
    drawAt: at(-65, 12),
    pickupStartAt: at(-60, 9),
    pickupEndAt: at(-50, 17),
    lines: [{ model: models.lat5420, quantity: 2, price: 900 }],
  });
  await audit(at(-84, 15), adminB, 'RESALE_CANCELLED', 'Resale', cancelled.resale.id, {
    previousValue: { status: 'SCHEDULED' },
    newValue: { status: 'CANCELLED' },
    reason: 'The pickup room is unavailable during the office renovation.',
  });

  // --- B: September resale — results published, pickups in progress -------------
  const september = await createResale({
    title: 'September 2026 Laptop Resale',
    description: 'ThinkPads and Latitudes from the R&D upgrade programme.',
    status: 'OPEN',
    site: TLV,
    admin: adminA,
    createdAt: at(-58, 10),
    publishedAt: at(-55, 9),
    openAt: at(-50, 9),
    closeAt: at(-36, 17),
    closedAt: at(-36, 17),
    drawAt: at(-35, 12),
    pickupStartAt: at(-30, 9),
    pickupEndAt: at(7, 17),
    lines: [
      { model: models.t14, quantity: 3, price: 1200 },
      { model: models.lat7430, quantity: 2, price: 1600 },
      { model: models.x1, quantity: 1, price: 1900 },
    ],
  });
  const septemberSpecs = entrants(september, employees.slice(6, 18), 13);
  septemberSpecs[0].cancelledAt = plusHours(septemberSpecs[0].submittedAt, 20);
  septemberSpecs[1].excludedReason = 'Excluded: leaving the company before the pickup window.';
  const septemberEntries: Entry[] = [];
  for (const spec of septemberSpecs) septemberEntries.push(await register(september, spec));
  const septemberDraw = await runDraw(september, septemberEntries, at(-35, 12));
  const sw = [...septemberDraw.winners];
  if (sw[0]) await complete(september, sw[0], at(-33, 10), at(-26, 11));
  if (sw[1]) await complete(september, sw[1], at(-32, 15), at(-21, 14));
  if (sw[2]) await claim(september, sw[2], at(-31, 9));
  if (sw[3]) await claim(september, sw[3], at(-29, 13));
  // sw[4] has not responded yet.
  let septemberPromoted: Winner | null = null;
  if (sw[5]) {
    septemberPromoted = await decline(
      september,
      sw[5],
      septemberDraw,
      at(-27, 11),
      'The keyboard layout does not suit me.'
    );
  }

  // --- C: Haifa resale — registration closed, draw in two days -----------------
  const haifa = await createResale({
    title: 'November 2026 Resale — Haifa',
    description: 'HP and Dell laptops for the Haifa office.',
    status: 'CLOSED',
    site: HAIFA,
    admin: adminB,
    createdAt: at(-24, 10),
    publishedAt: at(-20, 9),
    openAt: at(-16, 9),
    closeAt: at(-2, 17),
    closedAt: at(-2, 17),
    drawAt: at(2, 12),
    pickupStartAt: at(7, 9),
    pickupEndAt: at(21, 17),
    lines: [
      { model: models.hp840, quantity: 2, price: 750 },
      { model: models.lat5420, quantity: 2, price: 900 },
    ],
  });
  const haifaSpecs = entrants(haifa, employees.slice(18, 24), 12);
  const springBuyer = springWinners[0]?.entry.user;
  if (springBuyer) {
    haifaSpecs.push({
      user: springBuyer,
      choices: [models.lat5420],
      submittedAt: at(-9, 13),
      overrideReason: 'The laptop from the spring resale was returned under the defect policy.',
    });
  }
  for (const spec of haifaSpecs) await register(haifa, spec);

  // --- D: Holiday resale — registration open ------------------------------------
  const holiday = await createResale({
    title: 'Holiday 2026 Laptop Resale',
    description: 'ThinkPads, Latitudes and a MacBook Pro, just in time for the holidays.',
    status: 'OPEN',
    site: TLV,
    admin: adminA,
    createdAt: at(-9, 10),
    publishedAt: at(-6, 9),
    openAt: at(-4, 9),
    closeAt: at(10, 17),
    drawAt: at(11, 12),
    pickupStartAt: at(16, 9),
    pickupEndAt: at(30, 17),
    lines: [
      { model: models.t14, quantity: 2, price: 1200 },
      { model: models.lat7430, quantity: 2, price: 1600 },
      { model: models.mbp14, quantity: 1, price: 3200 },
    ],
  });
  const holidayUsers = employees.slice(24, 32);
  if (springDecliner) holidayUsers.push(springDecliner);
  // Submitted within the first 3 days (always before yesterday evening).
  const holidaySpecs = entrants(holiday, holidayUsers, 3);
  const holidayCanceller = holidaySpecs[holidaySpecs.length - 2];
  holidayCanceller.cancelledAt = plusHours(holidayCanceller.submittedAt, 5);
  for (const spec of holidaySpecs) await register(holiday, spec);

  // --- E: Q1 2027 resale — scheduled ---------------------------------------------
  await createResale({
    title: 'Q1 2027 MacBook & X1 Carbon Resale',
    description: 'Premium laptops. Purchase-based eligibility: only recent buyers are excluded.',
    status: 'SCHEDULED',
    site: TLV,
    admin: adminB,
    createdAt: at(-3, 14),
    publishedAt: at(-1, 9),
    openAt: at(20, 9),
    closeAt: at(34, 17),
    drawAt: at(35, 12),
    pickupStartAt: at(40, 9),
    pickupEndAt: at(55, 17),
    eligibilityMode: 'PURCHASE',
    lines: [
      { model: models.x1, quantity: 2, price: 1900 },
      { model: models.mbp14, quantity: 2, price: 3200 },
    ],
  });

  // --- F: Q2 2027 resale — draft --------------------------------------------------
  await createResale({
    title: 'Q2 2027 Laptop Resale',
    description: 'Draft — models and quantities still being finalised.',
    status: 'DRAFT',
    site: TLV,
    admin: adminA,
    createdAt: at(-1, 16),
    openAt: at(90, 9),
    closeAt: at(104, 17),
    drawAt: at(105, 12),
    pickupStartAt: at(110, 9),
    pickupEndAt: at(125, 17),
    lines: [
      { model: models.lat5420, quantity: 3, price: 850 },
      { model: models.hp840, quantity: 1, price: 700 },
    ],
  });

  // --- Summary ------------------------------------------------------------------
  const counts = {
    users: await prisma.user.count(),
    laptopModels: await prisma.laptopModel.count(),
    laptopUnits: await prisma.laptopUnit.count(),
    resales: await prisma.resale.count(),
    registrations: await prisma.registration.count(),
    handovers: await prisma.handoverRecord.count(),
    notifications: await prisma.notification.count(),
    auditLogs: await prisma.auditLog.count(),
  };
  console.log('Seeded:', counts);
  console.log('\nAdministrators:');
  for (const a of admins) console.log(`  ${a.fullName.padEnd(16)} ${a.email}`);
  console.log('\nEmployees worth signing in as:');
  const show = (label: string, u?: User | null) => u && console.log(`  ${label.padEnd(40)} ${u.fullName}`);
  show('Won in September, has not replied', sw[4]?.entry.user);
  show('Accepted in September, awaiting pickup', sw[2]?.entry.user);
  show('Promoted from the waiting list', septemberPromoted?.entry.user);
  show('Bought a laptop in the spring', springBuyer);
  show('Registered in the open resale', holidaySpecs[0]?.user);
  show('Not registered anywhere', emp('Rotem Ziv'));
  show('Marked ineligible by an admin', emp('Elad Tal'));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
