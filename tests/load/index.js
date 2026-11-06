import { sleep } from 'k6';
import {
  BASE_URL,
  OPERATOR_USERNAME,
  OPERATOR_PASSWORD,
  LOAD_PROFILE,
  getOptions,
} from './config.js';
import { runCitizenIntake } from './scenarios/citizen-intake.js';
import { runOperatorPolling } from './scenarios/operator-polling.js';
import { runApiRead } from './scenarios/api-read.js';
import { runRepairWorkflow } from './scenarios/repair-workflow.js';

export const options = getOptions();

const TARGET_SCENARIO = (__ENV.SCENARIO || 'all').toLowerCase();
const hasCredentials = Boolean(OPERATOR_USERNAME && OPERATOR_PASSWORD);

// Validate credentials up front for authenticated scenarios and profiles
if (!hasCredentials) {
  if (TARGET_SCENARIO === 'polling' || TARGET_SCENARIO === 'repair') {
    throw new Error(
      `[LoadTest Error] Scenario "${TARGET_SCENARIO}" requires authentication. Set LOAD_TEST_USERNAME and LOAD_TEST_PASSWORD.`,
    );
  }
  if (LOAD_PROFILE === 'baseline' || LOAD_PROFILE === 'stress' || LOAD_PROFILE === 'scalability') {
    throw new Error(
      `[LoadTest Error] Profile "${LOAD_PROFILE}" requires authenticated operator sessions. Set LOAD_TEST_USERNAME and LOAD_TEST_PASSWORD.`,
    );
  }
}

let smokeNoticeLogged = false;

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
      // If unauthenticated smoke test, run only public endpoints
      if (!hasCredentials) {
        if (!smokeNoticeLogged && __VU === 1 && __ITER === 0) {
          smokeNoticeLogged = true;
          // Security note: notice logged without any sensitive values
          console.log(
            '[Smoke] Running unauthenticated smoke scenarios (intake, read). Set LOAD_TEST_USERNAME and LOAD_TEST_PASSWORD to include authenticated operator workflows.',
          );
        }
        const rand = Math.random();
        if (rand < 0.7) {
          runCitizenIntake(BASE_URL);
          sleep(1);
        } else {
          runApiRead(BASE_URL);
          sleep(0.5);
        }
        break;
      }

      // Blended realistic load traffic with authenticated sessions:
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
