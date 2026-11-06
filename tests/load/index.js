import { sleep } from 'k6';
import { BASE_URL, OPERATOR_USERNAME, OPERATOR_PASSWORD, getOptions } from './config.js';
import { runCitizenIntake } from './scenarios/citizen-intake.js';
import { runOperatorPolling } from './scenarios/operator-polling.js';
import { runApiRead } from './scenarios/api-read.js';
import { runRepairWorkflow } from './scenarios/repair-workflow.js';

export const options = getOptions();

const TARGET_SCENARIO = (__ENV.SCENARIO || 'all').toLowerCase();

/**
 * Main VU iteration handler
 */
export default function () {
  switch (TARGET_SCENARIO) {
    case 'intake':
      runCitizenIntake(BASE_URL);
      sleep(1);
      break;

    case 'polling':
      runOperatorPolling(BASE_URL, OPERATOR_USERNAME, OPERATOR_PASSWORD);
      sleep(1);
      break;

    case 'read':
      runApiRead(BASE_URL);
      sleep(0.5);
      break;

    case 'repair':
      runRepairWorkflow(BASE_URL, OPERATOR_USERNAME, OPERATOR_PASSWORD);
      sleep(2);
      break;

    case 'all':
    default: {
      // Blended realistic load traffic:
      // ~60% Operator Dashboard Reads
      // ~25% Citizen Rescue Intakes
      // ~10% General API Reads
      // ~5% Repair / Operational Workflows
      const rand = Math.random();

      if (rand < 0.6) {
        runOperatorPolling(BASE_URL, OPERATOR_USERNAME, OPERATOR_PASSWORD);
        sleep(1);
      } else if (rand < 0.85) {
        runCitizenIntake(BASE_URL);
        sleep(1.5);
      } else if (rand < 0.95) {
        runApiRead(BASE_URL);
        sleep(0.5);
      } else {
        runRepairWorkflow(BASE_URL, OPERATOR_USERNAME, OPERATOR_PASSWORD);
        sleep(2);
      }
      break;
    }
  }
}
