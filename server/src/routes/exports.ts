import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils';
import { buildExport, ExportType } from '../services/excel';
import { recordAudit } from '../services/audit';

const router = Router();

// GET /api/exports/:type?resaleId=...  -> streams an XLSX workbook.
router.get(
  '/:type',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const type = req.params.type as ExportType;
    const idsParam = (req.query.resaleIds as string) || (req.query.resaleId as string) || '';
    const resaleIds = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const { buffer, filename } = await buildExport(type, resaleIds);

    await recordAudit({
      userId: req.user!.id,
      role: 'ADMIN',
      action: 'DATA_EXPORT',
      entityType: 'Export',
      entityId: type,
      newValue: { type, resaleIds },
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  })
);

export default router;
