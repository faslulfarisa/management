import { ConnectorReadDto } from '../dto/historical-attendance-import.dto';

export const HISTORICAL_ATTENDANCE_IMPORT_QUEUE = 'historical-attendance-import';
export const HISTORICAL_ATTENDANCE_IMPORT_EXECUTE_JOB = 'execute-import';

export interface HistoricalAttendanceImportJobData {
  tenantId: string;
  batchId: string;
  executionJobId: string;
  actorUserId: string;
  payload: ConnectorReadDto;
}
