// Scores a calibration test (docs/CALIBRATION.md). The field validator's app
// runs this; the resulting meter error goes into `issue_certificate`, which
// the program checks against MAX_METER_ERROR_BPS.

export const MAX_METER_ERROR_BPS = 500;
/** Minimum share of cards that must show acceptable coverage. */
export const MIN_CARDS_PASSING = 0.8;
/** Minimum blue coverage on a water-sensitive card to count as sprayed. */
export const MIN_CARD_COVERAGE_PCT = 10;

export interface CalibrationRun {
  /** Liters the drone reports it dispensed on the test strip. */
  reportedLiters: number;
  /** Tank weighed before and after the run, kg. */
  tankKgBefore: number;
  tankKgAfter: number;
  /** Density of the test liquid (water = 1.0). */
  densityKgPerL: number;
  /** Blue coverage % scored by the app for each card on the strip. */
  cardCoveragePct: number[];
  /** Practical assessment by the validator: planning, accuracy, safety. */
  operatorPassed: boolean;
}

export interface CalibrationResult {
  weighedLiters: number;
  meterErrorBps: number;
  meterOk: boolean;
  cardsPassingShare: number;
  sprayOk: boolean;
  certified: boolean;
}

export function scoreCalibration(run: CalibrationRun): CalibrationResult {
  const weighedLiters = (run.tankKgBefore - run.tankKgAfter) / run.densityKgPerL;
  const meterErrorBps =
    weighedLiters > 0
      ? Math.round((Math.abs(run.reportedLiters - weighedLiters) / weighedLiters) * 10_000)
      : 10_000;
  const meterOk = weighedLiters > 0 && meterErrorBps <= MAX_METER_ERROR_BPS;

  const cards = run.cardCoveragePct;
  const cardsPassingShare =
    cards.length > 0 ? cards.filter((c) => c >= MIN_CARD_COVERAGE_PCT).length / cards.length : 0;
  const sprayOk = cardsPassingShare >= MIN_CARDS_PASSING;

  return {
    weighedLiters,
    meterErrorBps,
    meterOk,
    cardsPassingShare,
    sprayOk,
    certified: meterOk && sprayOk && run.operatorPassed,
  };
}
