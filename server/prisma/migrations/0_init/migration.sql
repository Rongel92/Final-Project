-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT,
    "site" TEXT,
    "country" TEXT,
    "managerName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "manualEligibility" TEXT,
    "eligibilityNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resale" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "site" TEXT,
    "eligibleDepartments" TEXT,
    "eligibleGroups" TEXT,
    "registrationOpenAt" TIMESTAMP(3) NOT NULL,
    "registrationCloseAt" TIMESTAMP(3) NOT NULL,
    "resaleAt" TIMESTAMP(3),
    "pickupStartAt" TIMESTAMP(3),
    "pickupEndAt" TIMESTAMP(3),
    "cooldownMonths" INTEGER NOT NULL DEFAULT 36,
    "eligibilityMode" TEXT NOT NULL DEFAULT 'PARTICIPATION',
    "maxRegistrations" INTEGER NOT NULL DEFAULT 1,
    "allowCancellation" BOOLEAN NOT NULL DEFAULT true,
    "autoPublishResults" BOOLEAN NOT NULL DEFAULT false,
    "openOnPublish" BOOLEAN NOT NULL DEFAULT false,
    "termsVersion" TEXT NOT NULL DEFAULT '1.0',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Resale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaptopModel" (
    "id" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "processor" TEXT,
    "memory" TEXT,
    "storage" TEXT,
    "screenSize" TEXT,
    "operatingSystem" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'Good',
    "batteryCondition" TEXT,
    "accessories" TEXT,
    "description" TEXT,
    "imagePath" TEXT,
    "imageData" BYTEA,
    "imageMimeType" TEXT,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaptopModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResaleLaptopModel" (
    "id" TEXT NOT NULL,
    "resaleId" TEXT NOT NULL,
    "laptopModelId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pickupLocation" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResaleLaptopModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaptopUnit" (
    "id" TEXT NOT NULL,
    "laptopModelId" TEXT NOT NULL,
    "serialNumber" TEXT,
    "assetNumber" TEXT,
    "condition" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "assignedResaleId" TEXT,
    "assignedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaptopUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "resaleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "selectedLaptopModelId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "eligibilityStatus" TEXT NOT NULL DEFAULT 'ELIGIBLE',
    "eligibilityReason" TEXT,
    "eligibilityOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "overrideBy" TEXT,
    "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "termsVersion" TEXT,
    "typedFullName" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "preferenceRank" INTEGER NOT NULL DEFAULT 1,
    "multiChoiceAck" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationModelChoice" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "laptopModelId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrationModelChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationDeclaration" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "declarationKey" TEXT NOT NULL,
    "declarationText" TEXT NOT NULL,
    "declarationVersion" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "RegistrationDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResaleResult" (
    "id" TEXT NOT NULL,
    "resaleId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "laptopModelId" TEXT NOT NULL,
    "resultType" TEXT NOT NULL,
    "resultOrder" INTEGER NOT NULL DEFAULT 0,
    "randomSeedReference" TEXT,
    "resaleRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ResaleResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WinnerAssignment" (
    "id" TEXT NOT NULL,
    "resaleResultId" TEXT NOT NULL,
    "laptopUnitId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "responseDeadline" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "replacementFromResultId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WinnerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverRecord" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resaleId" TEXT NOT NULL,
    "laptopModelId" TEXT NOT NULL,
    "laptopUnitId" TEXT,
    "serialNumber" TEXT,
    "assetNumber" TEXT,
    "price" DOUBLE PRECISION,
    "pickupLocation" TEXT,
    "payrollDeductionConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "employeeConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "employeeTypedName" TEXT,
    "idNumber" TEXT,
    "signatureData" TEXT,
    "agreementVersion" TEXT,
    "agreementText" TEXT,
    "agreementPdf" BYTEA,
    "employeeConfirmedAt" TIMESTAMP(3),
    "administratorConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "administratorId" TEXT,
    "administratorConfirmedAt" TIMESTAMP(3),
    "reviewedFormId" TEXT,
    "notes" TEXT,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "declineAcknowledgedAt" TIMESTAMP(3),
    "appealSubmittedAt" TIMESTAMP(3),
    "appealText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HandoverRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedForm" (
    "id" TEXT NOT NULL,
    "resaleId" TEXT,
    "formType" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "fileData" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resaleId" TEXT,
    "registrationId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actionUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipationHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resaleId" TEXT NOT NULL,
    "registrationId" TEXT,
    "participationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "winner" BOOLEAN NOT NULL DEFAULT false,
    "purchaseCompleted" BOOLEAN NOT NULL DEFAULT false,
    "handoverCompletedAt" TIMESTAMP(3),
    "nextEligibleAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_department_idx" ON "User"("department");

-- CreateIndex
CREATE INDEX "Resale_status_idx" ON "Resale"("status");

-- CreateIndex
CREATE INDEX "ResaleLaptopModel_resaleId_idx" ON "ResaleLaptopModel"("resaleId");

-- CreateIndex
CREATE UNIQUE INDEX "ResaleLaptopModel_resaleId_laptopModelId_key" ON "ResaleLaptopModel"("resaleId", "laptopModelId");

-- CreateIndex
CREATE UNIQUE INDEX "LaptopUnit_serialNumber_key" ON "LaptopUnit"("serialNumber");

-- CreateIndex
CREATE INDEX "LaptopUnit_status_idx" ON "LaptopUnit"("status");

-- CreateIndex
CREATE INDEX "LaptopUnit_laptopModelId_idx" ON "LaptopUnit"("laptopModelId");

-- CreateIndex
CREATE INDEX "Registration_resaleId_idx" ON "Registration"("resaleId");

-- CreateIndex
CREATE INDEX "Registration_userId_idx" ON "Registration"("userId");

-- CreateIndex
CREATE INDEX "Registration_status_idx" ON "Registration"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_resaleId_userId_key" ON "Registration"("resaleId", "userId");

-- CreateIndex
CREATE INDEX "RegistrationModelChoice_registrationId_idx" ON "RegistrationModelChoice"("registrationId");

-- CreateIndex
CREATE INDEX "RegistrationModelChoice_laptopModelId_idx" ON "RegistrationModelChoice"("laptopModelId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationModelChoice_registrationId_laptopModelId_key" ON "RegistrationModelChoice"("registrationId", "laptopModelId");

-- CreateIndex
CREATE INDEX "RegistrationDeclaration_registrationId_idx" ON "RegistrationDeclaration"("registrationId");

-- CreateIndex
CREATE INDEX "ResaleResult_resaleId_idx" ON "ResaleResult"("resaleId");

-- CreateIndex
CREATE INDEX "ResaleResult_resultType_idx" ON "ResaleResult"("resultType");

-- CreateIndex
CREATE INDEX "ResaleResult_resaleRunId_idx" ON "ResaleResult"("resaleRunId");

-- CreateIndex
CREATE UNIQUE INDEX "WinnerAssignment_resaleResultId_key" ON "WinnerAssignment"("resaleResultId");

-- CreateIndex
CREATE UNIQUE INDEX "WinnerAssignment_laptopUnitId_key" ON "WinnerAssignment"("laptopUnitId");

-- CreateIndex
CREATE INDEX "WinnerAssignment_status_idx" ON "WinnerAssignment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "HandoverRecord_registrationId_key" ON "HandoverRecord"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoverRecord_laptopUnitId_key" ON "HandoverRecord"("laptopUnitId");

-- CreateIndex
CREATE INDEX "HandoverRecord_resaleId_idx" ON "HandoverRecord"("resaleId");

-- CreateIndex
CREATE INDEX "HandoverRecord_userId_idx" ON "HandoverRecord"("userId");

-- CreateIndex
CREATE INDEX "UploadedForm_resaleId_idx" ON "UploadedForm"("resaleId");

-- CreateIndex
CREATE INDEX "UploadedForm_formType_idx" ON "UploadedForm"("formType");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "ParticipationHistory_userId_idx" ON "ParticipationHistory"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "Resale" ADD CONSTRAINT "Resale_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResaleLaptopModel" ADD CONSTRAINT "ResaleLaptopModel_resaleId_fkey" FOREIGN KEY ("resaleId") REFERENCES "Resale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResaleLaptopModel" ADD CONSTRAINT "ResaleLaptopModel_laptopModelId_fkey" FOREIGN KEY ("laptopModelId") REFERENCES "LaptopModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaptopUnit" ADD CONSTRAINT "LaptopUnit_laptopModelId_fkey" FOREIGN KEY ("laptopModelId") REFERENCES "LaptopModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaptopUnit" ADD CONSTRAINT "LaptopUnit_assignedResaleId_fkey" FOREIGN KEY ("assignedResaleId") REFERENCES "Resale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaptopUnit" ADD CONSTRAINT "LaptopUnit_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_resaleId_fkey" FOREIGN KEY ("resaleId") REFERENCES "Resale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationModelChoice" ADD CONSTRAINT "RegistrationModelChoice_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationModelChoice" ADD CONSTRAINT "RegistrationModelChoice_laptopModelId_fkey" FOREIGN KEY ("laptopModelId") REFERENCES "LaptopModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDeclaration" ADD CONSTRAINT "RegistrationDeclaration_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResaleResult" ADD CONSTRAINT "ResaleResult_resaleId_fkey" FOREIGN KEY ("resaleId") REFERENCES "Resale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResaleResult" ADD CONSTRAINT "ResaleResult_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResaleResult" ADD CONSTRAINT "ResaleResult_laptopModelId_fkey" FOREIGN KEY ("laptopModelId") REFERENCES "LaptopModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinnerAssignment" ADD CONSTRAINT "WinnerAssignment_resaleResultId_fkey" FOREIGN KEY ("resaleResultId") REFERENCES "ResaleResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinnerAssignment" ADD CONSTRAINT "WinnerAssignment_laptopUnitId_fkey" FOREIGN KEY ("laptopUnitId") REFERENCES "LaptopUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverRecord" ADD CONSTRAINT "HandoverRecord_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverRecord" ADD CONSTRAINT "HandoverRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverRecord" ADD CONSTRAINT "HandoverRecord_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverRecord" ADD CONSTRAINT "HandoverRecord_resaleId_fkey" FOREIGN KEY ("resaleId") REFERENCES "Resale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverRecord" ADD CONSTRAINT "HandoverRecord_laptopModelId_fkey" FOREIGN KEY ("laptopModelId") REFERENCES "LaptopModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverRecord" ADD CONSTRAINT "HandoverRecord_laptopUnitId_fkey" FOREIGN KEY ("laptopUnitId") REFERENCES "LaptopUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedForm" ADD CONSTRAINT "UploadedForm_resaleId_fkey" FOREIGN KEY ("resaleId") REFERENCES "Resale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_resaleId_fkey" FOREIGN KEY ("resaleId") REFERENCES "Resale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationHistory" ADD CONSTRAINT "ParticipationHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationHistory" ADD CONSTRAINT "ParticipationHistory_resaleId_fkey" FOREIGN KEY ("resaleId") REFERENCES "Resale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationHistory" ADD CONSTRAINT "ParticipationHistory_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

