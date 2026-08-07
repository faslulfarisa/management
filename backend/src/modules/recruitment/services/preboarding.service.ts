import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { FileUploadService } from '../../../shared/file-upload.service';
import { DocumentService } from '../../platform/services/document.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { CommunicationService } from './communication.service';
import { BankDetails, EmergencyContact } from '../dto/preboarding.dto';

export interface PreboardingItem {
  key: string;
  label: string;
  category: string;
  status: 'pending' | 'completed' | 'not_applicable';
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
}

const DEFAULT_ITEMS: Array<Pick<PreboardingItem, 'key' | 'label' | 'category'>> = [
  { key: 'welcome_communication', label: 'Send welcome communication', category: 'communication' },
  { key: 'document_collection', label: 'Collect onboarding documents', category: 'documents' },
  { key: 'bank_details', label: 'Submit bank details', category: 'candidate' },
  { key: 'emergency_contact', label: 'Submit emergency contact', category: 'candidate' },
  { key: 'nda_policy_acceptance', label: 'Accept NDA & company policies', category: 'candidate' },
  { key: 'asset_request', label: 'Request onboarding assets (laptop, ID card, etc.)', category: 'logistics' },
  { key: 'account_creation_request', label: 'Request system account creation', category: 'logistics' },
  { key: 'joining_schedule', label: 'Confirm joining date & schedule', category: 'logistics' },
];

@Injectable()
export class PreboardingService {
  constructor(
    private db: DatabaseService,
    private fileUpload: FileUploadService,
    private documents: DocumentService,
    private notifications: NotificationEmitterService,
    private communication: CommunicationService,
  ) {}

  private buildDefaultItems(): PreboardingItem[] {
    return DEFAULT_ITEMS.map((i) => ({ ...i, status: 'pending', completed_at: null, completed_by: null, notes: null }));
  }

  /** Auto-creates the checklist on first access, seeded with the built-in default item set. */
  async getOrCreate(applicationId: string, tenantId: string, createdById: string | null) {
    const { rows: existing } = await this.db.query(
      'SELECT * FROM preboarding_checklists WHERE application_id = $1 AND tenant_id = $2',
      [applicationId, tenantId],
    );
    if (existing.length) return existing[0];

    const { rows: appRows } = await this.db.query(
      'SELECT id FROM applications WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [applicationId, tenantId],
    );
    if (!appRows.length) throw new NotFoundException('Application not found');

    const { rows: offerRows } = await this.db.query(
      `SELECT id, joining_date FROM offers WHERE application_id = $1 AND tenant_id = $2 AND status = 'accepted'
       ORDER BY responded_at DESC LIMIT 1`,
      [applicationId, tenantId],
    );
    const offer = offerRows[0];

    const { rows } = await this.db.query(
      `INSERT INTO preboarding_checklists (tenant_id, application_id, offer_id, items, joining_date, created_by)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING *`,
      [tenantId, applicationId, offer?.id ?? null, JSON.stringify(this.buildDefaultItems()), offer?.joining_date ?? null, createdById],
    );
    return rows[0];
  }

  async getForApplication(applicationId: string, tenantId: string) {
    return this.getOrCreate(applicationId, tenantId, null);
  }

  async listDocuments(applicationId: string, tenantId: string) {
    return this.documents.findAll(tenantId, 'application', applicationId);
  }

  private async updateRow(applicationId: string, tenantId: string, setClause: string, params: any[]) {
    const { rows } = await this.db.query(
      `UPDATE preboarding_checklists SET ${setClause}, updated_at = now()
       WHERE application_id = $1 AND tenant_id = $2 RETURNING *`,
      params,
    );
    if (!rows.length) throw new NotFoundException('Preboarding checklist not found');
    return rows[0];
  }

  private setItemStatus(
    items: PreboardingItem[],
    key: string,
    status: PreboardingItem['status'],
    actorId: string | null,
    notes?: string,
  ): PreboardingItem[] {
    const idx = items.findIndex((i) => i.key === key);
    if (idx === -1) return items;
    const next = [...items];
    next[idx] = {
      ...next[idx],
      status,
      notes: notes !== undefined ? notes : next[idx].notes,
      completed_at: status === 'completed' ? new Date().toISOString() : next[idx].completed_at,
      completed_by: status === 'completed' ? actorId : next[idx].completed_by,
    };
    return next;
  }

  private async maybeMarkOverallComplete(applicationId: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT items FROM preboarding_checklists WHERE application_id = $1 AND tenant_id = $2',
      [applicationId, tenantId],
    );
    if (!rows.length) return;
    const items: PreboardingItem[] = rows[0].items;
    const allDone = items.every((i) => i.status === 'completed' || i.status === 'not_applicable');
    await this.db.query(
      `UPDATE preboarding_checklists SET status = $3, updated_at = now() WHERE application_id = $1 AND tenant_id = $2`,
      [applicationId, tenantId, allDone ? 'completed' : 'in_progress'],
    );
  }

  // ── HR-side ────────────────────────────────────────────────────────────
  async updateItem(applicationId: string, tenantId: string, itemKey: string, data: { status: string; notes?: string }, actorId: string) {
    const checklist = await this.getOrCreate(applicationId, tenantId, actorId);
    const items = this.setItemStatus(checklist.items, itemKey, data.status as PreboardingItem['status'], actorId, data.notes);
    const updated = await this.updateRow(applicationId, tenantId, 'items = $3::jsonb', [applicationId, tenantId, JSON.stringify(items)]);
    await this.maybeMarkOverallComplete(applicationId, tenantId);
    return updated;
  }

  async updateJoiningDate(applicationId: string, tenantId: string, joiningDate: string, actorId: string) {
    const checklist = await this.getOrCreate(applicationId, tenantId, actorId);
    const items = this.setItemStatus(checklist.items, 'joining_schedule', 'completed', actorId);
    return this.updateRow(
      applicationId, tenantId,
      'joining_date = $3, items = $4::jsonb',
      [applicationId, tenantId, joiningDate, JSON.stringify(items)],
    );
  }

  /** Sends the welcome email via CommunicationService (logs to candidate_communications) and marks the checklist item complete. */
  async sendWelcomeCommunication(applicationId: string, tenantId: string, actorId: string, subject: string, body: string) {
    await this.getOrCreate(applicationId, tenantId, actorId);
    const result = await this.communication.send(applicationId, tenantId, actorId, { subject, body });
    await this.updateItem(applicationId, tenantId, 'welcome_communication', { status: 'completed' }, actorId);
    return result;
  }

  // ── Candidate-facing (public Career Portal, email-matched, no login) ───
  private async assertCandidateAccess(applicationId: string, tenantId: string, email: string) {
    const { rows } = await this.db.query(
      `SELECT a.id, c.email, c.first_name, c.last_name FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       WHERE a.id = $1 AND a.tenant_id = $2 AND a.deleted_at IS NULL`,
      [applicationId, tenantId],
    );
    if (!rows.length || rows[0].email.toLowerCase() !== email.trim().toLowerCase()) {
      throw new NotFoundException('Application not found');
    }
    return rows[0];
  }

  private async resolveUserIdForEmployee(tenantId: string, employeeId: string | null): Promise<string | null> {
    if (!employeeId) return null;
    const { rows } = await this.db.query('SELECT id FROM users WHERE tenant_id = $1 AND employee_id = $2 AND deleted_at IS NULL LIMIT 1', [tenantId, employeeId]);
    return rows[0]?.id ?? null;
  }

  private async notifyStakeholders(tenantId: string, applicationId: string, title: string, message: string) {
    const { rows: appRows } = await this.db.query('SELECT vacancy_id FROM applications WHERE id = $1', [applicationId]);
    const vacancyId = appRows[0]?.vacancy_id;
    if (!vacancyId) return;
    const { rows: vacancyRows } = await this.db.query('SELECT recruiter_id, hiring_manager_id FROM vacancies WHERE id = $1', [vacancyId]);
    const vacancy = vacancyRows[0];
    if (!vacancy) return;
    const userIds = (await Promise.all(
      [vacancy.recruiter_id, vacancy.hiring_manager_id].map((empId: string | null) => this.resolveUserIdForEmployee(tenantId, empId)),
    )).filter((id): id is string => !!id);
    if (!userIds.length) return;
    await this.notifications.emit(tenantId, {
      userIds, title, message, type: 'info', sourceModule: 'recruitment', entityType: 'application', entityId: applicationId,
      actionUrl: `/dashboard/hr/recruitment/onboarding/${applicationId}`,
    });
  }

  async getForCandidate(applicationId: string, tenantId: string, email: string) {
    await this.assertCandidateAccess(applicationId, tenantId, email);
    return this.getOrCreate(applicationId, tenantId, null);
  }

  async submitBankDetails(applicationId: string, tenantId: string, email: string, details: BankDetails) {
    const candidate = await this.assertCandidateAccess(applicationId, tenantId, email);
    const checklist = await this.getOrCreate(applicationId, tenantId, null);
    const merged = { ...checklist.bank_details, ...details };
    const items = this.setItemStatus(checklist.items, 'bank_details', 'completed', null);
    const updated = await this.updateRow(
      applicationId, tenantId,
      'bank_details = $3::jsonb, items = $4::jsonb',
      [applicationId, tenantId, JSON.stringify(merged), JSON.stringify(items)],
    );
    await this.maybeMarkOverallComplete(applicationId, tenantId);
    await this.notifyStakeholders(tenantId, applicationId, 'Preboarding update', `${candidate.first_name} ${candidate.last_name} submitted bank details.`);
    return updated;
  }

  async submitEmergencyContact(applicationId: string, tenantId: string, email: string, contact: EmergencyContact) {
    const candidate = await this.assertCandidateAccess(applicationId, tenantId, email);
    const checklist = await this.getOrCreate(applicationId, tenantId, null);
    const items = this.setItemStatus(checklist.items, 'emergency_contact', 'completed', null);
    const updated = await this.updateRow(
      applicationId, tenantId,
      'emergency_contact = $3::jsonb, items = $4::jsonb',
      [applicationId, tenantId, JSON.stringify(contact), JSON.stringify(items)],
    );
    await this.maybeMarkOverallComplete(applicationId, tenantId);
    await this.notifyStakeholders(tenantId, applicationId, 'Preboarding update', `${candidate.first_name} ${candidate.last_name} submitted an emergency contact.`);
    return updated;
  }

  async acceptNda(applicationId: string, tenantId: string, email: string, ipAddress?: string) {
    const candidate = await this.assertCandidateAccess(applicationId, tenantId, email);
    const checklist = await this.getOrCreate(applicationId, tenantId, null);
    const items = this.setItemStatus(checklist.items, 'nda_policy_acceptance', 'completed', null);
    const updated = await this.updateRow(
      applicationId, tenantId,
      'nda_accepted_at = now(), nda_accepted_ip = $3, items = $4::jsonb',
      [applicationId, tenantId, ipAddress ?? null, JSON.stringify(items)],
    );
    await this.maybeMarkOverallComplete(applicationId, tenantId);
    await this.notifyStakeholders(tenantId, applicationId, 'Preboarding update', `${candidate.first_name} ${candidate.last_name} accepted the NDA & company policies.`);
    return updated;
  }

  async uploadDocumentFromCandidate(
    applicationId: string, tenantId: string, email: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    const candidate = await this.assertCandidateAccess(applicationId, tenantId, email);
    this.fileUpload.validateDocumentFile(file.buffer, file.mimetype);
    const { url, sizeBytes } = await this.fileUpload.uploadDocument(file.buffer, file.mimetype, 'applications', tenantId, file.originalname);
    const doc = await this.documents.create(tenantId, null as any, {
      entity_type: 'application', entity_id: applicationId, document_type: 'onboarding',
      name: file.originalname, file_url: url, file_size_bytes: sizeBytes, mime_type: file.mimetype,
    });
    const checklist = await this.getOrCreate(applicationId, tenantId, null);
    const items = this.setItemStatus(checklist.items, 'document_collection', 'completed', null);
    await this.updateRow(applicationId, tenantId, 'items = $3::jsonb', [applicationId, tenantId, JSON.stringify(items)]);
    await this.maybeMarkOverallComplete(applicationId, tenantId);
    await this.notifyStakeholders(tenantId, applicationId, 'Preboarding update', `${candidate.first_name} ${candidate.last_name} uploaded an onboarding document.`);
    return doc;
  }
}
