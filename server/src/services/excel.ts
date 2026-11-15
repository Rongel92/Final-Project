import ExcelJS from 'exceljs';
import { prisma } from '../prisma';
import { HttpError } from '../utils';

type Row = Record<string, string | number | boolean | null | undefined>;

// Adds a worksheet whose columns are derived from the first row's keys.
function addSheet(wb: ExcelJS.Workbook, name: string, rows: Row[]): void {
  const ws = wb.addWorksheet(name.slice(0, 31));
  const data = rows.length ? rows : [{ Info: 'No records' }];
  const keys = Object.keys(data[0]);
  ws.columns = keys.map((k) => ({ header: k, key: k, width: Math.min(40, Math.max(12, k.length + 4)) }));
  ws.getRow(1).font = { bold: true };
  data.forEach((r) => ws.addRow(r));
}

async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

function fmt(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString() : '';
}

async function registrationRows(resaleIds?: string[]): Promise<Row[]> {
  const regs = await prisma.registration.findMany({
    where: resaleIds && resaleIds.length ? { resaleId: { in: resaleIds } } : undefined,
    include: { user: true, resale: true, modelChoices: { orderBy: { priority: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  const models = await prisma.laptopModel.findMany();
  const modelName = (id: string | null) => {
    const m = models.find((x) => x.id === id);
    return m ? `${m.manufacturer} ${m.modelName}` : '';
  };
  return regs.map((r) => {
    const ids =
      r.modelChoices.length > 0
        ? r.modelChoices.map((c) => c.laptopModelId)
        : r.selectedLaptopModelId
          ? [r.selectedLaptopModelId]
          : [];
    const names = ids.map(modelName).filter(Boolean);
    return {
      EmployeeName: r.user.fullName,
      Email: r.user.email,
      Department: r.user.department ?? '',
      Site: r.user.site ?? '',
      Resale: r.resale.title,
      SelectedModels: names.join(', '),
      ModelsSelected: names.length,
      FirstChoice: names[0] ?? '',
      RegistrationDate: fmt(r.submittedAt ?? r.createdAt),
      Eligibility: r.eligibilityStatus,
      EligibilityReason: r.eligibilityReason ?? '',
      Override: r.eligibilityOverride ? 'Yes' : 'No',
      TermsAccepted: r.termsAccepted ? 'Yes' : 'No',
      Status: r.status,
    };
  });
}

async function resultRows(resaleIds: string[] | undefined, resultType?: string): Promise<Row[]> {
  const results = await prisma.resaleResult.findMany({
    where: {
      ...(resaleIds && resaleIds.length ? { resaleId: { in: resaleIds } } : {}),
      ...(resultType ? { resultType } : {}),
    },
    include: {
      registration: { include: { user: true, handover: { select: { declinedAt: true } } } },
      laptopModel: true,
      resale: true,
      assignment: { select: { replacementFromResultId: true } },
    },
    orderBy: [{ resultType: 'asc' }, { resultOrder: 'asc' }],
  });
  const isWinners = resultType === 'WINNER';
  // A winner who declined keeps their WINNER row (shown as Declined on the resale
  // page); only the runner-up who replaced them is exported as a winner.
  const rows = isWinners ? results.filter((r) => !r.registration.handover?.declinedAt) : results;
  return rows.map((r) => ({
    Resale: r.resale.title,
    ResultType: r.resultType,
    Order: r.resultOrder + 1,
    EmployeeName: r.registration.user.fullName,
    Email: r.registration.user.email,
    Model: `${r.laptopModel.manufacturer} ${r.laptopModel.modelName}`,
    ...(isWinners ? { 'RU-Winner': r.assignment?.replacementFromResultId ? 'Yes' : 'No' } : {}),
    SeedReference: r.randomSeedReference ?? '',
    ResaleRun: r.resaleRunId ?? '',
    Published: fmt(r.publishedAt),
  }));
}

async function inventoryRows(): Promise<Row[]> {
  const units = await prisma.laptopUnit.findMany({ include: { laptopModel: true } });
  return units.map((u) => ({
    Model: `${u.laptopModel.manufacturer} ${u.laptopModel.modelName}`,
    SerialNumber: u.serialNumber ?? '',
    AssetNumber: u.assetNumber ?? '',
    Condition: u.condition ?? '',
    Status: u.status,
    AssignedResale: u.assignedResaleId ?? '',
    AssignedUser: u.assignedUserId ?? '',
  }));
}

async function handoverRows(resaleIds?: string[]): Promise<Row[]> {
  const records = await prisma.handoverRecord.findMany({
    where: {
      ...(resaleIds && resaleIds.length ? { resaleId: { in: resaleIds } } : {}),
      // Declined handovers stay visible under Handovers → History only.
      declinedAt: null,
    },
    include: { user: true, laptopModel: true, administrator: true, resale: true },
  });
  return records.map((h) => {
    const m = /^Resale-(\d+)$/.exec(h.resale.title);
    const formName = `${m ? `Resale-${m[1]}` : h.resale.title}-${h.user.fullName}`;
    return {
      FormName: formName,
      Resale: h.resale.title,
      EmployeeName: h.user.fullName,
      Email: h.user.email,
      Model: `${h.laptopModel.manufacturer} ${h.laptopModel.modelName}`,
      SerialNumber: h.serialNumber ?? '',
      AssetNumber: h.assetNumber ?? '',
      Price: h.price ?? '',
      CollectionLocation: h.pickupLocation ?? '',
      PayrollDeduction: h.payrollDeductionConfirmed ? 'Yes' : 'No',
      EmployeeConfirmed: h.employeeConfirmation ? 'Yes' : 'No',
      EmployeeTypedName: h.employeeTypedName ?? '',
      IDNumber: h.idNumber ?? '',
      EmployeeConfirmedAt: fmt(h.employeeConfirmedAt),
      AdminConfirmed: h.administratorConfirmation ? 'Yes' : 'No',
      Administrator: h.administrator?.fullName ?? '',
      AdminConfirmedAt: fmt(h.administratorConfirmedAt),
      CompletedAt: fmt(h.completedAt),
      Notes: h.notes ?? '',
    };
  });
}

async function participationRows(): Promise<Row[]> {
  const history = await prisma.participationHistory.findMany({
    include: { user: true, resale: true },
    orderBy: { participationDate: 'desc' },
  });
  return history.map((p) => ({
    EmployeeName: p.user.fullName,
    Resale: p.resale.title,
    ParticipationDate: fmt(p.participationDate),
    Winner: p.winner ? 'Yes' : 'No',
    PurchaseCompleted: p.purchaseCompleted ? 'Yes' : 'No',
    HandoverCompletedAt: fmt(p.handoverCompletedAt),
    NextEligibleAt: fmt(p.nextEligibleAt),
  }));
}

async function auditRows(): Promise<Row[]> {
  const logs = await prisma.auditLog.findMany({
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  return logs.map((l) => ({
    Timestamp: fmt(l.createdAt),
    Action: l.action,
    EntityType: l.entityType,
    EntityId: l.entityId ?? '',
    User: l.user?.fullName ?? '',
    Role: l.role ?? '',
    Reason: l.reason ?? '',
    PreviousValue: l.previousValue ?? '',
    NewValue: l.newValue ?? '',
  }));
}

async function laptopModelRows(resaleIds?: string[]): Promise<Row[]> {
  const links = await prisma.resaleLaptopModel.findMany({
    where: resaleIds && resaleIds.length ? { resaleId: { in: resaleIds } } : undefined,
    include: { laptopModel: true, resale: true },
  });
  return links.map((l) => ({
    Resale: l.resale.title,
    Manufacturer: l.laptopModel.manufacturer,
    Model: l.laptopModel.modelName,
    Processor: l.laptopModel.processor ?? '',
    Memory: l.laptopModel.memory ?? '',
    Storage: l.laptopModel.storage ?? '',
    Screen: l.laptopModel.screenSize ?? '',
    OS: l.laptopModel.operatingSystem ?? '',
    Condition: l.laptopModel.condition,
    Price: l.price,
    Quantity: l.quantity,
    CollectionLocation: l.pickupLocation ?? '',
  }));
}

export type ExportType =
  | 'registrations'
  | 'eligible'
  | 'ineligible'
  | 'winners'
  | 'waiting'
  | 'not-selected'
  | 'pickup'
  | 'handovers'
  | 'inventory'
  | 'participation'
  | 'audit'
  | 'full-report';

export async function buildExport(type: ExportType, resaleIds?: string[]): Promise<{ buffer: Buffer; filename: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Laptop Resale System';
  wb.created = new Date();

  switch (type) {
    case 'registrations': {
      addSheet(wb, 'Registrations', await registrationRows(resaleIds));
      return { buffer: await toBuffer(wb), filename: 'registrations.xlsx' };
    }
    case 'eligible': {
      const rows = (await registrationRows(resaleIds)).filter(
        (r) => r.Eligibility === 'ELIGIBLE' || r.Eligibility === 'OVERRIDDEN'
      );
      addSheet(wb, 'Eligible', rows);
      return { buffer: await toBuffer(wb), filename: 'eligible-registrations.xlsx' };
    }
    case 'ineligible': {
      const rows = (await registrationRows(resaleIds)).filter((r) => r.Eligibility === 'INELIGIBLE');
      addSheet(wb, 'Ineligible', rows);
      return { buffer: await toBuffer(wb), filename: 'ineligible-registrations.xlsx' };
    }
    case 'winners': {
      addSheet(wb, 'Winners', await resultRows(resaleIds, 'WINNER'));
      return { buffer: await toBuffer(wb), filename: 'winners.xlsx' };
    }
    case 'waiting': {
      addSheet(wb, 'Waiting List', await resultRows(resaleIds, 'WAITING_LIST'));
      return { buffer: await toBuffer(wb), filename: 'waiting-list.xlsx' };
    }
    case 'not-selected': {
      addSheet(wb, 'Not Selected', await resultRows(resaleIds, 'EXCLUDED'));
      return { buffer: await toBuffer(wb), filename: 'not-selected.xlsx' };
    }
    case 'pickup':
    case 'handovers': {
      addSheet(wb, 'Handovers', await handoverRows(resaleIds));
      return { buffer: await toBuffer(wb), filename: 'handovers.xlsx' };
    }
    case 'inventory': {
      addSheet(wb, 'Inventory', await inventoryRows());
      return { buffer: await toBuffer(wb), filename: 'inventory.xlsx' };
    }
    case 'participation': {
      addSheet(wb, 'Participation History', await participationRows());
      return { buffer: await toBuffer(wb), filename: 'participation-history.xlsx' };
    }
    case 'audit': {
      addSheet(wb, 'Audit Log', await auditRows());
      return { buffer: await toBuffer(wb), filename: 'audit-log.xlsx' };
    }
    case 'full-report': {
      const resales = await prisma.resale.findMany({
        where: resaleIds && resaleIds.length ? { id: { in: resaleIds } } : undefined,
        orderBy: { createdAt: 'asc' },
      });
      if (resales.length === 0) throw new HttpError(404, 'No resales found for this export.');
      const summary: Row[] = resales.map((resale) => ({
        Resale: resale.title,
        Status: resale.status,
        RegistrationOpens: fmt(resale.registrationOpenAt),
        RegistrationCloses: fmt(resale.registrationCloseAt),
        ResaleDate: fmt(resale.resaleAt),
        CooldownMonths: resale.cooldownMonths,
        EligibilityMode: resale.eligibilityMode,
      }));
      addSheet(wb, 'Resale Summary', summary);
      addSheet(wb, 'Laptop Models', await laptopModelRows(resaleIds));
      addSheet(wb, 'Registrations', await registrationRows(resaleIds));
      addSheet(wb, 'Winners', await resultRows(resaleIds, 'WINNER'));
      addSheet(wb, 'Waiting List', await resultRows(resaleIds, 'WAITING_LIST'));
      addSheet(wb, 'Handovers', await handoverRows(resaleIds));
      addSheet(wb, 'Participation History', await participationRows());
      addSheet(wb, 'Audit Log', await auditRows());
      const filename = resales.length === 1 ? `resale-report-${resales[0].title}.xlsx` : 'resale-report-all.xlsx';
      return { buffer: await toBuffer(wb), filename };
    }
    default:
      throw new HttpError(400, 'Unknown export type.');
  }
}
