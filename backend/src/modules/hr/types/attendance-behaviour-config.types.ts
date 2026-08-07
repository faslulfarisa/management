// Shape of `performance_configuration.config`. Every business rule the
// Attendance Behaviour Performance Engine applies lives here so org admins
// can retune it without a deploy — see docs/PERFORMANCE_ATTENDANCE_ENGINE_REPORT.md
// for the formula each field feeds into.
export interface AttendanceBehaviourWeights {
  attendancePercentage: number;
  punctuality: number;
  consistency: number;
  halfDayBehaviour: number;
  unapprovedAbsence: number;
  approvedOvertime: number;
  attendanceCorrections: number;
}

export interface OverallScoreWeights {
  kra: number;
  kpi: number;
  attendanceBehaviour: number;
}

export interface RatingBucket {
  label: string;
  min: number;
  max: number;
}

export interface AttendanceBehaviourConfig {
  weights: AttendanceBehaviourWeights;
  overallWeights: OverallScoreWeights;
  latePenaltyPoints: number;
  lateGraceThreshold: number;
  consistencyPenaltyMultiplier: number;
  halfDayPenaltyPoints: number;
  unapprovedAbsencePenaltyPoints: number;
  otCapHours: number;
  otNeutralWhenIneligible: boolean;
  correctionPenaltyPoints: number;
  correctionGraceCount: number;
  complianceThresholdPct: number;
  ratingBuckets: RatingBucket[];
}

export const DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG: AttendanceBehaviourConfig = {
  weights: {
    attendancePercentage: 40,
    punctuality: 20,
    consistency: 10,
    halfDayBehaviour: 10,
    unapprovedAbsence: 10,
    approvedOvertime: 5,
    attendanceCorrections: 5,
  },
  overallWeights: { kra: 40, kpi: 40, attendanceBehaviour: 20 },
  latePenaltyPoints: 5,
  lateGraceThreshold: 0,
  consistencyPenaltyMultiplier: 1,
  halfDayPenaltyPoints: 8,
  unapprovedAbsencePenaltyPoints: 15,
  otCapHours: 20,
  otNeutralWhenIneligible: true,
  correctionPenaltyPoints: 5,
  correctionGraceCount: 2,
  complianceThresholdPct: 90,
  ratingBuckets: [
    { label: 'Outstanding', min: 95, max: 100 },
    { label: 'Excellent', min: 85, max: 94.99 },
    { label: 'Good', min: 75, max: 84.99 },
    { label: 'Needs Improvement', min: 60, max: 74.99 },
    { label: 'Unsatisfactory', min: 0, max: 59.99 },
  ],
};
